"""Small, dependency-free contracts shared by the packager, worker and offline installer."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
from urllib.parse import urlsplit


class InstallError(Exception):
    def __init__(self, code: str, message: str, action: str = "Run doctor and review the installation guide."):
        super().__init__(message)
        self.code, self.message, self.action = code, message, action


def read_json(path: Path):
    with path.open(encoding="utf-8-sig") as stream:
        return json.load(stream)


def atomic_json(path: Path, data, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        os.chmod(temporary, mode)
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
            json.dump(data, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inside(root: Path, relative: str) -> Path:
    name = PurePosixPath(relative)
    if not relative or "\\" in relative or name.is_absolute() or any(p in ("..", ".") for p in name.parts) or ":" in relative:
        raise InstallError("INVALID_PATH", "The package contains an invalid path.")
    target = root.joinpath(*name.parts)
    if target.is_symlink() or any(p.is_symlink() for p in target.parents if p != root.parent):
        raise InstallError("SYMLINK_NOT_ALLOWED", "Symbolic links are not allowed in release files.")
    if not target.resolve().is_relative_to(root.resolve()):
        raise InstallError("INVALID_PATH", "The package path escapes its root.")
    return target


def run(args, *, cwd=None, input=None, env=None, timeout=120):
    try:
        result = subprocess.run([str(a) for a in args], cwd=cwd, input=input, env=env,
                                capture_output=True, timeout=timeout, check=False)
    except (OSError, subprocess.TimeoutExpired):
        raise InstallError("COMMAND_UNAVAILABLE", "A required command is unavailable or timed out.", "Check prerequisites and service status.") from None
    if result.returncode:
        # Child output can contain passwords, SQL data or connection strings. Never echo it.
        raise InstallError("COMMAND_FAILED", "A required operation failed.", "Run doctor; inspect the service locally without sharing credentials.")
    return result.stdout.decode("utf-8", errors="replace")


def origin(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
        raise InstallError("INVALID_ORIGIN", "An HTTPS origin without a path is required.")
    if any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-" for c in parsed.hostname):
        raise InstallError("INVALID_ORIGIN", "Use an ASCII DNS name or IPv4 address.")
    return f"https://{parsed.netloc}".rstrip("/")


def verify_release(root: Path, trusted_key: Path, *, acceptance=True):
    root = root.resolve()
    if not trusted_key.is_file() or trusted_key.resolve().is_relative_to(root):
        raise InstallError("TRUST_KEY_REQUIRED", "Provide a trusted public key obtained separately from the package.")
    run(["openssl", "pkeyutl", "-verify", "-pubin", "-rawin", "-inkey", trusted_key,
         "-sigfile", root / "manifest.sig", "-in", root / "manifest.json"])
    manifest = read_json(root / "manifest.json")
    if manifest.get("format") != "kalamapp-release-v1" or manifest.get("platform") != "ubuntu-24.04-amd64":
        raise InstallError("UNSUPPORTED_RELEASE", "The release format or platform is not supported.")
    files = manifest.get("files")
    if not isinstance(files, dict) or not files:
        raise InstallError("EMPTY_RELEASE", "The release has no verified files.")
    for name, digest in files.items():
        path = inside(root, name)
        if not path.is_file() or sha256(path) != digest:
            raise InstallError("CHECKSUM_MISMATCH", "A release file is missing or damaged.", "Download or copy the same signed release again.")
    if acceptance:
        for check in ("central_release", "clean_database", "offline_install"):
            if manifest.get("checks", {}).get(check) != "passed":
                raise InstallError("RELEASE_NOT_ACCEPTED", f"Release acceptance is incomplete: {check}.")
    for name in [manifest.get("compose", ""), manifest.get("frontend_index", ""), "env-defaults.json",
                 *manifest.get("install_sql", []), *manifest.get("upgrade_sql", []),
                 *manifest.get("images", []), *manifest.get("debs", []), *manifest.get("python_wheels", []),
                 *[manifest[k] for k in ("transfer_policy", "transfer_signer", "post_import_sql", "transfer_drain_sql") if manifest.get(k)]]:
        if name not in files:
            raise InstallError("UNVERIFIED_INPUT", "A runtime input is absent from the signed file inventory.")
    if not manifest.get("install_sql") or not manifest.get("images"):
        raise InstallError("INCOMPLETE_RELEASE", "Database bootstrap and offline images are required.")
    return manifest


def sanitize_report(report):
    if not isinstance(report, dict) or report.get("format") != "kalamapp-diagnostics-v1":
        raise InstallError("INVALID_REPORT", "The diagnostic report is invalid.")
    import re
    services = []
    for service in report.get("services", [])[:32]:
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,48}", str(service.get("name", ""))):
            continue
        status = service.get("status")
        services.append({"name": service["name"], "status": status if status in ("healthy", "unhealthy", "running", "stopped", "unknown") else "unknown"})
    return {"format": "kalamapp-diagnostics-v1", "generated_at": report.get("generated_at"),
            "version": re.sub(r"[^0-9.]", "", str(report.get("version", "")))[:40],
            "disk_free_bytes": max(0, min(int(report.get("disk_free_bytes", 0)), 10**18)),
            "last_backup_at": report.get("last_backup_at"), "services": services}
