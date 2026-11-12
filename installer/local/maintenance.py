"""Local lifecycle operations. All destructive work requires explicit operator confirmation."""
from __future__ import annotations
import base64
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
import zipfile
from common import InstallError, atomic_json, inside, read_json, run, sha256, verify_release


def safe_extract(archive_path: Path, target: Path, max_bytes=256 * 1024**3):
    with tarfile.open(archive_path) as archive:
        entries = archive.getmembers()
        names = set()
        total = 0
        for member in entries:
            inside(target, member.name)
            if not member.isfile() or member.name in names:
                raise InstallError("UNSAFE_ARCHIVE", "Archives may contain regular, unique files only.")
            names.add(member.name)
            total += member.size
            if total > max_bytes or len(names) > 100000:
                raise InstallError("ARCHIVE_TOO_LARGE", "The archive exceeds the supported extraction limits.")
        existing = target
        while not existing.exists(): existing = existing.parent
        if shutil.disk_usage(existing).free < total + 1024**3:
            raise InstallError("LOW_DISK", "There is not enough free space to extract this archive.")
        for member in entries:
            path = inside(target, member.name)
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with archive.extractfile(member) as incoming, path.open("xb") as outgoing:
                os.chmod(path, 0o600)
                shutil.copyfileobj(incoming, outgoing)


def load_crypto_wheels(installer):
    manifest = read_json(installer.root / "release" / "manifest.json")
    target = installer.root / "private" / "python"
    import sys
    if str(target) not in sys.path: sys.path.insert(0, str(target))
    for name in manifest.get("python_wheels", []):
        path = inside(installer.root / "release", name)
        if manifest["files"].get(name) != sha256(path): raise InstallError("WHEEL_MISMATCH", "An offline Python wheel is not verified.")
        with zipfile.ZipFile(path) as wheel:
            for item in wheel.infolist():
                if item.is_dir(): continue
                output = inside(target, item.filename)
                output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                if not output.exists():
                    with output.open("xb") as stream: stream.write(wheel.read(item))


def stream_compose(installer, args, output):
    command = ["docker", "compose", "--project-name", installer.state["project"], "--env-file", str(installer.env), "-f", str(installer.root / "release" / "compose.yml"), *args]
    with output.open("xb") as stream:
        os.chmod(output, 0o600)
        process = subprocess.run(command, cwd=installer.root, stdout=stream, stderr=subprocess.DEVNULL, timeout=3600)
    if process.returncode: raise InstallError("DATABASE_BACKUP_FAILED", "The database backup failed. Services remain stopped for review.")


def stop_application(installer):
    services = installer.compose("config", "--services").splitlines()
    installer.compose("stop", "--timeout", "60", *[s for s in services if s != "db"], timeout=300)
    installer.save(maintenance=True)


def backup(installer, recipient: Path, output: Path):
    from envelope import encrypt
    if not recipient or not recipient.is_file(): raise InstallError("BACKUP_RECIPIENT_REQUIRED", "Provide --recipient-pub; keep its recovery private key separately.")
    with tempfile.TemporaryDirectory(dir=installer.root / "private", prefix="backup-") as folder:
        work = Path(folder)
        stop_application(installer)
        stream_compose(installer, ["exec", "-T", "db", "pg_dump", "-U", "postgres", "-d", "postgres", "-Fc"], work / "database.dump")
        storage = installer.root / "data" / "storage"
        if not storage.is_dir(): raise InstallError("STORAGE_PATH_MISSING", "The configured local storage directory does not exist.")
        with tarfile.open(work / "storage.tar.gz", "w:gz", dereference=False) as archive:
            for path in storage.rglob("*"):
                if path.is_symlink(): raise InstallError("STORAGE_SYMLINK", "Storage contains a symbolic link; backup stopped.")
                if path.is_file(): archive.add(path, arcname=path.relative_to(storage).as_posix(), recursive=False)
        metadata = {"format": "kalamapp-backup-v1", "code": installer.state["code"], "version": installer.state["version"], "created_at": datetime.now(timezone.utc).isoformat(),
                    "database_checksum": sha256(work / "database.dump"), "storage_checksum": sha256(work / "storage.tar.gz")}
        atomic_json(work / "backup.json", metadata)
        # All private settings and encryption keys are inside authenticated encryption.
        with tarfile.open(work / "backup.tar.gz", "w:gz") as archive:
            for name in ("database.dump", "storage.tar.gz", "backup.json"):
                archive.add(work / name, arcname=name, recursive=False)
            archive.add(installer.root / "private" / "secrets.json", arcname="secrets.json", recursive=False)
            archive.add(installer.env, arcname="customer.env", recursive=False)
        encrypt(work / "backup.tar.gz", output, recipient.read_bytes())
        installer.save(last_backup_at=metadata["created_at"], last_backup_checksum=sha256(output))
        installer.compose("up", "-d", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "240", timeout=300)
        installer.save(maintenance=False)
    print(f"Encrypted backup complete: {output}")


def restore(installer, args):
    from envelope import decrypt
    from cli import sql_literal
    if not args.file or not args.recovery_key: raise InstallError("RESTORE_INPUT_REQUIRED", "restore requires --file and --recovery-key.")
    if input("This replaces local data. Type the installation code: ") != installer.state["code"]:
        raise InstallError("CANCELLED", "Restore cancelled.")
    if sha256(args.file) != installer.state.get("last_backup_checksum") and not args.backup_checksum:
        raise InstallError("BACKUP_CHECKSUM_REQUIRED", "Provide the backup checksum from your separately stored recovery record.")
    if args.backup_checksum and sha256(args.file) != args.backup_checksum:
        raise InstallError("BACKUP_CHECKSUM_MISMATCH", "The backup differs from its recovery record.")
    with tempfile.TemporaryDirectory(dir=installer.root / "private", prefix="restore-") as folder:
        work = Path(folder)
        decrypt(args.file, work / "backup.tar.gz", args.recovery_key.read_bytes(), getpass.getpass("Recovery key password: ").encode() or None)
        safe_extract(work / "backup.tar.gz", work / "backup")
        metadata = read_json(work / "backup" / "backup.json")
        if metadata.get("code") != installer.state["code"] or metadata.get("version") != installer.state["version"]:
            raise InstallError("BACKUP_VERSION_MISMATCH", "Restore requires the matching installation and software version.")
        for name, digest in (("database.dump", metadata["database_checksum"]), ("storage.tar.gz", metadata["storage_checksum"])):
            if sha256(work / "backup" / name) != digest: raise InstallError("BACKUP_DAMAGED", "A backup component is damaged.")
        # Verify archive safety before stopping any service or replacing data.
        safe_extract(work / "backup" / "storage.tar.gz", work / "storage")
        (work / 'storage').mkdir(exist_ok=True, mode=0o700)
        stop_application(installer)
        installer.save(recovery_required=True)
        destination_dump = installer.root / "data" / "restore.dump"
        shutil.copyfile(work / "backup" / "database.dump", destination_dump)
        installer.compose("cp", destination_dump, "db:/tmp/kalamapp-restore.dump")
        # Prove PostgreSQL can restore the dump into an isolated database first.
        test_db = "kalamapp_restore_" + os.urandom(6).hex()
        installer.sql("create database " + test_db + ";")
        try:
            installer.compose("exec", "-T", "db", "pg_restore", "-U", "postgres", "--exit-on-error", "--no-owner", "--no-acl", "-d", test_db, "/tmp/kalamapp-restore.dump", timeout=3600)
            installer.compose("exec", "-T", "db", "pg_restore", "-U", "postgres", "--clean", "--if-exists", "--exit-on-error", "--single-transaction", "-d", "postgres", "/tmp/kalamapp-restore.dump", timeout=3600)
        finally:
            installer.sql("drop database if exists " + test_db + ";")
            installer.compose("exec", "-T", "db", "rm", "-f", "/tmp/kalamapp-restore.dump")
            destination_dump.unlink(missing_ok=True)
        current_storage = installer.root / "data" / "storage"
        old_storage = installer.root / "data" / ("storage-before-restore-" + os.urandom(4).hex())
        current_storage.rename(old_storage)
        shutil.move(str(work / "storage"), current_storage)
        # Keep the previous storage as a recovery option; never merge old and restored trees.
        for name, destination in (("secrets.json", installer.root / "private" / "secrets.json"), ("customer.env", installer.env)):
            shutil.copyfile(work / "backup" / name, destination); os.chmod(destination, 0o600)
        installer.save(recovery_required=False, maintenance=False)
        installer.compose("up", "-d", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "240", timeout=300)
        installer.doctor()
    print("Restore complete. Review sign-in, data, files and integrations before serving users.")


def upgrade(installer, args):
    if not args.bundle or not args.trust_key or not args.recipient_pub:
        raise InstallError("UPGRADE_INPUT_REQUIRED", "upgrade requires --bundle, --trust-key and --recipient-pub.")
    manifest = verify_release(args.bundle, args.trust_key)
    if installer.state["version"] not in manifest.get("upgrade_from", []):
        raise InstallError("UNSUPPORTED_UPGRADE", "This release has no tested upgrade path from the installed version.")
    installer.preflight(manifest)
    if input("Upgrade after an encrypted backup? Type UPGRADE: ") != "UPGRADE": raise InstallError("CANCELLED", "Upgrade cancelled.")
    backup_dir = installer.root / "backups"; backup_dir.mkdir(mode=0o700, exist_ok=True)
    backup(installer, args.recipient_pub, backup_dir / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".enc"))
    stop_application(installer)
    new = installer.root / "releases" / manifest["version"]
    new.parent.mkdir(exist_ok=True)
    if not new.exists(): shutil.copytree(args.bundle, new)
    previous = installer.root / "releases" / installer.state["version"]
    if previous.exists(): raise InstallError("RELEASE_HISTORY_CONFLICT", "The previous release directory already exists; review before upgrading.")
    (installer.root / "release").rename(previous)
    shutil.copytree(new, installer.root / "release")
    installer.save(upgrade_from=installer.state["version"], recovery_required=True)
    for name in manifest["images"]: run(["docker", "load", "--input", inside(new, name)], timeout=1800)
    installer.validate_compose(manifest)
    installer.database(manifest, upgrade=True)
    installer.save(version=manifest["version"])
    html = inside(installer.root / 'release', manifest['frontend_index']).read_text(encoding='utf-8')
    if '<head>' not in html: raise InstallError('INVALID_FRONTEND_HTML', 'The frontend entrypoint is invalid.')
    (installer.root / 'private' / 'index.html').write_text(html.replace('<head>', '<head><meta name="kalamapp-deployment" content="self_hosted">', 1), encoding='utf-8')
    from cli import sql_literal
    installer.sql('update public.local_deployment_runtime set version=' + sql_literal(manifest['version']) + ' where org_id=' + sql_literal(installer.state['org_id']) + ';')
    installer.compose("up", "-d", "--force-recreate", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "240", timeout=300)
    installer.doctor()
    installer.save(recovery_required=False, maintenance=False)
    print("Upgrade complete. Previous software and encrypted backup are retained for reviewed recovery.")


def maintain(installer, args):
    if not installer.state.get("project"): raise InstallError("NOT_INSTALLED", "No installation exists in this directory.")
    if args.command in ("backup", "restore", "import-data"): load_crypto_wheels(installer)
    if args.command == "backup":
        output = args.file or installer.root / "backups" / (datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".enc")
        output.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        backup(installer, args.recipient_pub, output)
    elif args.command == "restore": restore(installer, args)
    elif args.command == "upgrade": load_crypto_wheels(installer); upgrade(installer, args)
    elif args.command == "logs":
        print(json.dumps({key: installer.state.get(key) for key in ("phase", "version", "maintenance", "recovery_required", "sql_in_flight", "last_backup_at")}, indent=2))
        print("Raw application logs remain on this server; only allowlisted operation metadata is exported.")
    elif args.command == "report":
        report = installer.doctor()
        config = installer.state["config"]
        if not config.get("telemetry_enabled"): raise InstallError("TELEMETRY_DISABLED", "Automatic reports were not enabled for this installation. Use diagnostics.json manually.")
        settings = read_json(installer.root / "private" / "report-endpoint.json")
        if not settings.get("url", "").startswith("https://"): raise InstallError("INVALID_REPORT_URL", "A trusted HTTPS report endpoint is required.")
        request = urllib.request.Request(settings["url"], data=json.dumps({"action": "report", "installation_id": settings["installation_id"], "report": report}).encode(),
            headers={"Authorization": "Bearer " + settings["token"], "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                if response.status != 200: raise ValueError()
        except Exception: raise InstallError("REPORT_NOT_SENT", "The central report could not be sent. The local installation continues to work.") from None
        print("Health report sent. No business records or credentials were included.")
    elif args.command == "activate":
        from cli import sql_literal
        installer.doctor()
        if installer.state["config"]["install_kind"] == "migration" and installer.state.get("snapshot_kind") != "export_final":
            raise InstallError("FINAL_SNAPSHOT_REQUIRED", "Trial copies cannot activate outbound operations.")
        if input("Enable this installation and its configured outbound operations? Type the installation code: ") != installer.state["code"]:
            raise InstallError("CANCELLED", "Activation cancelled.")
        if installer.state["config"]["install_kind"] == "migration" and input("The cloud source must remain read-only. Type SOURCE FROZEN: ") != "SOURCE FROZEN":
            raise InstallError("SOURCE_FREEZE_REQUIRED", "Verify that the source remains frozen before activating.")
        text = installer.env.read_text(encoding="utf-8").replace("KALAMAPP_LOCAL_ACTIVATED='false'", "KALAMAPP_LOCAL_ACTIVATED='true'")
        installer.env.write_text(text, encoding="utf-8"); os.chmod(installer.env, 0o600)
        values = read_json(installer.root / 'private' / 'secrets.json')
        values['KALAMAPP_LOCAL_ACTIVATED'] = 'true'
        atomic_json(installer.root / 'private' / 'secrets.json', values)
        installer.sql("update public.local_deployment_runtime set activated=true where org_id=" + sql_literal(installer.state["org_id"]) + ";")
        installer.compose("up", "-d", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "240", timeout=300)
        installer.save(phase="active")
    elif args.command == "import-data":
        from restore_tenant import restore_tenant
        restore_tenant(installer, args)
