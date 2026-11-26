"""Build on a controlled Linux builder, never on a customer's server.

Input is a staged, tested release. This tool does not guess migration ordering or
download moving tags. The release test runner produces acceptance.json.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import tarfile
from common import InstallError, atomic_json, inside, read_json, run, sha256


def package(stage: Path, spec_path: Path, signing_key: Path, output: Path):
    spec = read_json(spec_path)
    proof = read_json(stage / "acceptance.json")
    if not re.fullmatch(r"[a-f0-9]{40}", spec.get("commit_sha", "")) or not re.fullmatch(r"\d+(?:\.\d+)+", spec.get("version", "")):
        raise InstallError("INVALID_RELEASE_ID", "A full commit SHA and numeric version are required.")
    checks = {name: "passed" if proof.get(name, {}).get("passed") is True else "pending"
              for name in ("central_release", "clean_database", "offline_install", "tenant_transfer")}
    if proof.get("version") != spec["version"] or proof.get("commit_sha") != spec["commit_sha"]:
        raise InstallError("PROOF_VERSION_MISMATCH", "Acceptance results belong to another release.")
    if any(checks[k] != "passed" for k in ("central_release", "clean_database", "offline_install")):
        raise InstallError("ACCEPTANCE_REQUIRED", "Do not publish a release before real offline and database tests pass.")
    files = {}
    forbidden = re.compile(r"(^|/)(\.env[^/]*|.*\.(?:pem|key)|customer\.env|.*\.dump|.*\.pgpass|.*\.pyc)$", re.I)
    for path in sorted(stage.rglob("*")):
        name = path.relative_to(stage).as_posix()
        if path.is_symlink() or forbidden.search(name):
            raise InstallError("PRIVATE_FILE_IN_RELEASE", "A private file or symlink is present in the shared release.")
        if path.is_file() and name not in ("manifest.json", "manifest.sig"):
            files[name] = sha256(path)
    manifest = {**spec, "format": "kalamapp-release-v1", "platform": "ubuntu-24.04-amd64", "checks": checks, "files": files}
    for name in [spec["compose"], *spec["install_sql"], *spec.get("upgrade_sql", []), *spec["images"], *spec.get("debs", [])]:
        if name not in files:
            raise InstallError("MISSING_RELEASE_INPUT", f"A required input is missing: {name}")
    # Prove the tested files, rather than trusting an unattached boolean report.
    tested = proof.get("files", {})
    if any(tested.get(name) != digest for name, digest in files.items() if name != "acceptance.json"):
        raise InstallError("UNTESTED_FILES", "Staged files differ from the tested file inventory.")
    atomic_json(stage / "manifest.json", manifest, 0o644)
    run(["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", signing_key, "-in", stage / "manifest.json", "-out", stage / "manifest.sig"])
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise InstallError("IMMUTABLE_RELEASE", "A published archive cannot be overwritten.")
    with tarfile.open(output, "w:gz") as archive:
        for name in [*files, "manifest.json", "manifest.sig"]:
            archive.add(inside(stage, name), arcname=name, recursive=False)
    output.with_suffix(output.suffix + ".sha256").write_text(sha256(output) + "  " + output.name + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--stage", required=True, type=Path)
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--signing-key", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        package(args.stage, args.spec, args.signing_key, args.output)
        print("Release signed and packaged. Publish only the verified archive and public metadata.")
    except InstallError as error:
        parser.exit(1, f"{error.code}: {error.message}\n{error.action}\n")
