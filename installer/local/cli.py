#!/usr/bin/env python3
"""Offline installation and maintenance. English terminal UI; Persian operator guides."""
from __future__ import annotations
import argparse
import base64
from datetime import datetime, timezone
import getpass
import hashlib
import hmac
import json
import os
from pathlib import Path
import platform
import secrets
import shutil
import socket
import ssl
import sys
import tarfile
import time
import urllib.error
import urllib.request
import uuid
from common import InstallError, atomic_json, inside, origin, read_json, run, sanitize_report, sha256, verify_release


def now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def jwt(secret, role):
    encode = lambda x: base64.urlsafe_b64encode(json.dumps(x, separators=(",", ":")).encode()).decode().rstrip("=")
    body = encode({"alg": "HS256", "typ": "JWT"}) + "." + encode({"role": role, "iss": "supabase", "iat": int(time.time()), "exp": int(time.time()) + 10 * 365 * 86400})
    return body + "." + base64.urlsafe_b64encode(hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()).decode().rstrip("=")


class Installer:
    def __init__(self, root: Path, bundle: Path | None = None):
        self.root = root.resolve()
        self.bundle = bundle.resolve() if bundle else None
        self.state_path = self.root / "state.json"
        self.state = read_json(self.state_path) if self.state_path.is_file() else {"format": "kalamapp-install-state-v1", "phase": "new", "sql": {}}
        if self.state.get("format") != "kalamapp-install-state-v1":
            raise InstallError("INVALID_STATE", "The installation state format is invalid.")
        self.env = self.root / "private" / "customer.env"

    def save(self, **patch):
        self.state.update(patch)
        atomic_json(self.state_path, self.state)

    def compose(self, *args, input=None, timeout=120):
        return run(["docker", "compose", "--project-name", self.state["project"], "--env-file", self.env,
                    "-f", self.root / "release" / "compose.yml", *args], cwd=self.root, input=input, timeout=timeout)

    def sql(self, text: str, timeout=120):
        return self.compose("exec", "-T", "db", "psql", "-X", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt", input=text.encode(), timeout=timeout)

    def preflight(self, manifest, installing=False):
        if platform.system() != "Linux" or platform.machine() not in ("x86_64", "amd64"):
            raise InstallError("UNSUPPORTED_OS", "Ubuntu 24.04 amd64 is required.")
        release = dict(line.split("=", 1) for line in Path("/etc/os-release").read_text().splitlines() if "=" in line)
        if release.get("ID", "").strip('"') != "ubuntu" or release.get("VERSION_ID", "").strip('"') != "24.04":
            raise InstallError("UNSUPPORTED_OS", "This release supports Ubuntu 24.04 only.")
        if os.geteuid() != 0:
            raise InstallError("ROOT_REQUIRED", "Run the installer using sudo.")
        memory = int(next(line.split()[1] for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemTotal:"))) * 1024
        if memory < manifest.get("minimum_ram_bytes", 8 * 1024**3) * .95:
            raise InstallError("LOW_MEMORY", "The server does not meet the memory requirement.")
        existing = self.root
        while not existing.exists():
            existing = existing.parent
        needed = manifest.get("minimum_free_bytes", 80 * 1024**3)
        if shutil.disk_usage(existing).free < needed:
            raise InstallError("LOW_DISK", "There is not enough free disk space.", "Free space or choose another data volume.")
        if installing:
            for port in (80, 443):
                with socket.socket() as probe:
                    try: probe.bind(("0.0.0.0", port))
                    except OSError:
                        raise InstallError("PORT_IN_USE", f"Port {port} is already in use.", "Use a dedicated server or configure the existing reverse proxy first.") from None

    def install_docker(self, manifest):
        if not shutil.which("docker"):
            if not manifest.get("debs"):
                raise InstallError("OFFLINE_DOCKER_MISSING", "Docker is not installed and this bundle has no offline packages.")
            run(["dpkg", "-i", *[inside(self.bundle, p) for p in manifest["debs"]]], timeout=600)
            run(["systemctl", "enable", "--now", "docker"])
        run(["docker", "info", "--format", "{{.ServerVersion}}"])
        run(["docker", "compose", "version"])

    def configure(self, config):
        if self.env.is_file():
            if self.state.get("public_url") != config["public_url"] or self.state.get("code") != config["system_code"]:
                raise InstallError("INSTALLATION_MISMATCH", "This directory belongs to another installation.")
            return
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        private = self.root / "private"
        private.mkdir(mode=0o700, exist_ok=True)
        os.chmod(private, 0o700)
        secret = secrets.token_urlsafe(48)
        values = {
            "CUSTOMER_PUBLIC_URL": config["public_url"], "SITE_URL": config["public_url"], "API_EXTERNAL_URL": config["public_url"],
            "SUPABASE_PUBLIC_URL": config["public_url"], "PUBLIC_SITE_URL": config["public_url"],
            "POSTGRES_PASSWORD": secrets.token_hex(32), "JWT_SECRET": secret,
            "ANON_KEY": jwt(secret, "anon"), "SERVICE_ROLE_KEY": jwt(secret, "service_role"),
            "VAULT_ENC_KEY": secrets.token_hex(16), "PG_META_CRYPTO_KEY": secrets.token_hex(32),
            "SECRET_KEY_BASE": secrets.token_hex(64), "DASHBOARD_USERNAME": "local-admin", "DASHBOARD_PASSWORD": secrets.token_hex(24),
            "LOGFLARE_PUBLIC_ACCESS_TOKEN": secrets.token_hex(32), "LOGFLARE_PRIVATE_ACCESS_TOKEN": secrets.token_hex(32),
            "S3_PROTOCOL_ACCESS_KEY_ID": secrets.token_hex(16), "S3_PROTOCOL_ACCESS_KEY_SECRET": secrets.token_hex(32),
            "EMAIL_SECRET_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
            "INSTAGRAM_SECRET_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
            "INTEGRATION_SECRET_ENCRYPTION_KEY": base64.b64encode(secrets.token_bytes(32)).decode(),
            "KALAMAPP_DEPLOYMENT_MODE": "self_hosted", "KALAMAPP_LOCAL_ACTIVATED": "false",
            "KALAM_AUTH_SMS_HOOK_ENABLED": "false", "ENABLE_EMAIL_SIGNUP": "true", "DISABLE_SIGNUP": "true", "ENABLE_EMAIL_AUTOCONFIRM": "false",
            "TZ": "Asia/Tehran", "PGRST_DB_SCHEMAS": "public,storage,graphql_public", "PGPASSWORD": "",
        }
        # The release declares non-secret defaults explicitly. No central installation env is copied.
        defaults = read_json(self.bundle / "env-defaults.json")
        if not isinstance(defaults, dict) or any(not isinstance(v, (str, int, bool)) for v in defaults.values()):
            raise InstallError("INVALID_ENV_DEFAULTS", "Offline service defaults are invalid.")
        import re
        for key, value in defaults.items():
            if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or any(c in str(value) for c in "\n\r\x00'$"):
                raise InstallError("INVALID_ENV_DEFAULTS", "A service default contains invalid characters.")
        values = {**{key: str(v) for key, v in defaults.items()}, **values}
        with self.env.open("x", encoding="utf-8", newline="\n") as stream:
            os.chmod(self.env, 0o600)
            stream.write("\n".join(f"{k}='{v}'" for k, v in values.items()) + "\n")
        atomic_json(private / "secrets.json", values)
        self.save(project="kalamapp-" + secrets.token_hex(6), public_url=config["public_url"], code=config["system_code"], org_id=config.get("customer_org_id") or str(uuid.uuid4()),
                  config=config, phase="configured")

    def certificates(self, config):
        target = self.root / "private" / "tls"
        target.mkdir(exist_ok=True, mode=0o700)
        existing = (target / "server.key").exists() and (target / "server.crt").exists()
        if not existing and config["tls_mode"] == "provided":
            cert = Path(input("Certificate PEM file: ").strip()).resolve()
            key = Path(input("Private key PEM file: ").strip()).resolve()
            shutil.copyfile(cert, target / "server.crt")
            shutil.copyfile(key, target / "server.key")
        elif not existing:
            host = urllib.parse.urlsplit(config["public_url"]).hostname
            run(["openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes", "-days", "3650", "-subj", "/CN=KalamApp Local CA", "-keyout", target / "ca.key", "-out", target / "ca.crt"])
            run(["openssl", "req", "-newkey", "rsa:3072", "-nodes", "-subj", f"/CN={host}", "-keyout", target / "server.key", "-out", target / "server.csr"])
            import ipaddress
            try: ipaddress.ip_address(host); san = "IP:"
            except ValueError: san = "DNS:"
            (target / "extensions.cnf").write_text(f"subjectAltName={san}{host}\nextendedKeyUsage=serverAuth\n", encoding="ascii")
            run(["openssl", "x509", "-req", "-in", target / "server.csr", "-CA", target / "ca.crt", "-CAkey", target / "ca.key", "-CAcreateserial", "-days", "365", "-extfile", target / "extensions.cnf", "-out", target / "server.crt"])
            print(f"Trust this CA on client devices: {target / 'ca.crt'}")
        os.chmod(target / "server.key", 0o600)
        run(["openssl", "x509", "-checkend", "86400", "-noout", "-in", target / "server.crt"])
        host = urllib.parse.urlsplit(config["public_url"]).hostname
        import ipaddress
        try: ipaddress.ip_address(host); host_check = '-checkip'
        except ValueError: host_check = '-checkhost'
        run(["openssl", "x509", "-noout", host_check, host, "-in", target / "server.crt"])
        cert_public = run(["openssl", "x509", "-pubkey", "-noout", "-in", target / "server.crt"])
        key_public = run(["openssl", "pkey", "-pubout", "-in", target / "server.key"])
        if cert_public.strip() != key_public.strip(): raise InstallError("TLS_KEY_MISMATCH", "The certificate and private key do not match.")

    def validate_compose(self, manifest):
        config = json.loads(self.compose("config", "--format", "json"))
        services = config.get("services", {})
        if not set(manifest["required_services"]).issubset(services):
            raise InstallError("MISSING_SERVICE", "A required service is absent from Compose.")
        for name, service in services.items():
            if "build" in service or service.get("privileged") or service.get("network_mode") == "host":
                raise InstallError("UNSAFE_COMPOSE", "Customer packages cannot build images or use privileged/host networking.")
            image = service.get("image")
            if not image or image not in manifest.get("image_ids", {}):
                raise InstallError("UNPINNED_IMAGE", "Every service image must have a verified immutable image ID.")
            actual = run(["docker", "image", "inspect", "--format", "{{.Id}}", image]).strip()
            if actual != manifest["image_ids"][image]: raise InstallError("IMAGE_MISMATCH", "A loaded image differs from the signed release.")
            for volume in service.get("volumes", []):
                if "docker.sock" in str(volume) or volume.get("source") == "/":
                    raise InstallError("UNSAFE_MOUNT", "Docker socket and host root mounts are not allowed.")
            for port in service.get("ports", []):
                if name != "frontend" and port.get("host_ip") not in ("127.0.0.1", "::1"):
                    raise InstallError("EXPOSED_BACKEND", "Backend ports must not be published publicly.")

    def database(self, manifest, upgrade=False):
        self.sql("create table if not exists public.local_installation_schema_history(path text primary key,checksum text not null,applied_at timestamptz not null default now()); alter table public.local_installation_schema_history enable row level security; revoke all on public.local_installation_schema_history from public,anon,authenticated;")
        if self.state.get("sql_in_flight"):
            raise InstallError("SQL_REVIEW_REQUIRED", "A previous SQL operation was interrupted.", "Review database state and reconcile the exact SQL checksum before resuming. Do not clear state blindly.")
        for name in manifest.get("upgrade_sql" if upgrade else "install_sql", []):
            digest = manifest["files"][name]
            previous = self.sql("select checksum from public.local_installation_schema_history where path=" + sql_literal(name)) .strip()
            if previous:
                if previous != digest: raise InstallError("SQL_HISTORY_MISMATCH", "An applied SQL file has changed.")
                continue
            self.save(sql_in_flight={"path": name, "checksum": digest})
            content = inside(self.root / "release", name).read_text(encoding="utf-8-sig")
            self.sql(content, timeout=1200)
            self.sql("insert into public.local_installation_schema_history(path,checksum) values(" + sql_literal(name) + "," + sql_literal(digest) + ");")
            self.state["sql"][name] = digest
            self.save(sql_in_flight=None)

    def request(self, path, payload=None, *, token=None):
        values = read_json(self.root / "private" / "secrets.json")
        context = ssl.create_default_context()
        ca = self.root / "private" / "tls" / "ca.crt"
        if ca.is_file(): context.load_verify_locations(cafile=str(ca))
        request = urllib.request.Request(self.state["public_url"] + path, data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json", "apikey": values["ANON_KEY"], "Authorization": "Bearer " + (token or values["SERVICE_ROLE_KEY"])})
        try:
            with urllib.request.urlopen(request, context=context, timeout=30) as response:
                return json.load(response)
        except (urllib.error.URLError, ValueError):
            raise InstallError("ENDPOINT_FAILED", "A local application endpoint failed.", "Check DNS, TLS and service health with doctor.") from None

    def provision(self, manifest):
        config = self.state["config"]
        if config["install_kind"] == "migration":
            print("The clean target is ready. Import the encrypted trial snapshot before activation.")
            return
        if self.state.get("admin_id"):
            if not self.state.get('org_provisioned'): self.bind_org(manifest)
            return
        # Create organization and role before Auth triggers evaluate their foreign keys.
        self.bind_org(manifest)
        existing = self.sql('select id from auth.users where lower(email)=lower(' + sql_literal(config['admin_email']) + ') and raw_user_meta_data->>\'org_id\'=' + sql_literal(self.state['org_id']) + ';').strip()
        if existing:
            self.save(admin_id=str(uuid.UUID(existing)))
            self.bind_org(manifest)
            return
        password = getpass.getpass("New local administrator password (minimum 12 characters): ")
        if len(password) < 12 or password != getpass.getpass("Repeat password: "):
            raise InstallError("INVALID_PASSWORD", "Passwords must match and contain at least 12 characters.")
        # Persist only the user ID. A failed resume is reconciled by email, never by resetting a password.
        user = self.request("/auth/v1/admin/users", {"email": config["admin_email"], "password": password, "email_confirm": True,
            "user_metadata": {"full_name": config["admin_name"], "org_id": self.state["org_id"]}})
        self.save(admin_id=user["id"])
        self.bind_org(manifest)

    def bind_org(self, manifest):
        config = self.state["config"]
        org_id = self.state["org_id"]; user_id = self.state.get("admin_id")
        role_id = str(uuid.uuid5(uuid.UUID(org_id), "local-administrator"))
        permissions = manifest.get("admin_permissions")
        policy = manifest.get("availability")
        if not isinstance(permissions, dict) or "__saas_admin" in permissions or not isinstance(policy, dict):
            raise InstallError("LOCAL_POLICY_MISSING", "An audited local role and availability policy are required.")
        sql = f"""begin;
insert into public.organizations(id,name,is_active) values({sql_literal(org_id)},{sql_literal(config['customer_name'])},true) on conflict(id) do nothing;
insert into public.org_roles(id,org_id,title,permissions) values({sql_literal(role_id)},{sql_literal(org_id)},'مدیر سازمان',{sql_json(permissions)}) on conflict(id) do nothing;
insert into public.saas_org_settings(org_id,slug,status,is_demo,is_readonly,resolved_host)
 values({sql_literal(org_id)},{sql_literal('local-' + config['system_code'].lower())},'active',false,false,{sql_literal(urllib.parse.urlsplit(config['public_url']).hostname)})
 on conflict(org_id) do update set resolved_host=excluded.resolved_host,is_readonly=false,status='active';
"""
        if user_id:
            sql += f"""insert into public.profiles(id,org_id,role_id,full_name) values({sql_literal(user_id)},{sql_literal(org_id)},{sql_literal(role_id)},{sql_literal(config['admin_name'])}) on conflict(id) do update set org_id=excluded.org_id,role_id=excluded.role_id;
insert into public.user_organization_memberships(user_id,org_id,role_id,software_role,is_owner,is_active) values({sql_literal(user_id)},{sql_literal(org_id)},{sql_literal(role_id)},'admin',true,true) on conflict(user_id,org_id) do update set role_id=excluded.role_id,is_owner=true,is_active=true;
"""
        sql += f"""insert into public.local_deployment_runtime(org_id,code,version,features,modules) values({sql_literal(org_id)},{sql_literal(config['system_code'])},{sql_literal(manifest['version'])},{sql_json(policy.get('features', {}))},{sql_json(policy.get('modules', {}))}) on conflict(org_id) do update set code=excluded.code,version=excluded.version;
commit;"""
        self.sql(sql)
        self.save(org_provisioned=True)

    def install(self, trusted_key, config_path, accept=False):
        print("[1/7] Verify release signature and files")
        manifest = verify_release(self.bundle, trusted_key)
        config = read_json(config_path)
        config["public_url"] = origin(config.get("public_url", ""))
        for field in ("system_code", "customer_name", "admin_email", "admin_name", "install_kind", "tls_mode"):
            if not config.get(field): raise InstallError("CONFIG_REQUIRED", f"Installation configuration is missing: {field}.")
        if config["install_kind"] not in ("fresh", "migration") or config["tls_mode"] not in ("provided", "internal_ca"):
            raise InstallError("INVALID_CONFIG", "Installation or certificate mode is invalid.")
        print("[2/7] Check server and offline prerequisites")
        self.preflight(manifest, installing=self.state["phase"] == "new")
        if not accept and input("Install this verified release? Type INSTALL: ") != "INSTALL":
            raise InstallError("CANCELLED", "Installation cancelled.")
        self.install_docker(manifest)
        print("[3/7] Create private settings and certificates")
        self.configure(config)
        self.certificates(config)
        release_dir = self.root / "release"
        if not release_dir.exists(): shutil.copytree(self.bundle, release_dir)
        else:
            if sha256(release_dir / "manifest.json") != sha256(self.bundle / "manifest.json"):
                raise InstallError("USE_UPGRADE", "Another release is already staged. Use upgrade.")
        values = read_json(self.root / "private" / "secrets.json")
        atomic_json(self.root / "private" / "runtime-public.json", {"deploymentMode": "self_hosted", "supabaseUrl": config["public_url"], "supabaseAnonKey": values["ANON_KEY"], "installationCode": config["system_code"]}, 0o644)
        runtime = "window.__KALAMAPP_RUNTIME_CONFIG__ = " + json.dumps(read_json(self.root / "private" / "runtime-public.json")) + ";\n"
        (self.root / "private" / "kalamapp-runtime-config.js").write_text(runtime, encoding="utf-8")
        if manifest.get('frontend_index') not in manifest['files']:
            raise InstallError('LOCAL_HTML_REQUIRED', 'The signed release must include the frontend HTML entrypoint.')
        html = inside(release_dir, manifest['frontend_index']).read_text(encoding='utf-8')
        if '<head>' not in html: raise InstallError('INVALID_FRONTEND_HTML', 'The frontend HTML entrypoint is invalid.')
        (self.root / 'private' / 'index.html').write_text(html.replace('<head>', '<head><meta name="kalamapp-deployment" content="self_hosted">', 1), encoding='utf-8')
        print("[4/7] Load offline images and validate service configuration")
        for image in manifest["images"]: run(["docker", "load", "--input", inside(release_dir, image)], timeout=1800)
        self.validate_compose(manifest)
        print("[5/7] Start database and apply the explicit SQL manifest")
        self.compose("up", "-d", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "180", "db", timeout=240)
        self.database(manifest)
        print("[6/7] Start application and provision the local organization")
        self.compose("up", "-d", "--pull", "never", "--no-build", "--wait", "--wait-timeout", "240", timeout=300)
        self.provision(manifest)
        self.save(version=manifest["version"], phase="verifying")
        print("[7/7] Verify services and write a diagnostic report")
        self.doctor()
        self.save(phase="trial" if config["install_kind"] == "migration" else "installed")
        print(f"Installation prepared: {config['public_url']}\nLocal dashboard: {config['public_url']}/installation")
        print("Outbound operations remain disabled until explicit activation. See the Persian installation guide.")

    def doctor(self):
        raw = self.compose("ps", "--all", "--format", "json")
        try: rows = json.loads(raw); rows = rows if isinstance(rows, list) else [rows]
        except ValueError: rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
        report = sanitize_report({"format": "kalamapp-diagnostics-v1", "generated_at": now(), "version": self.state.get("version", ""),
            "disk_free_bytes": shutil.disk_usage(self.root).free, "last_backup_at": self.state.get("last_backup_at"),
            "services": [{"name": row.get("Service", "unknown"), "status": row.get("Health") or ("running" if row.get("State") == "running" else "stopped")} for row in rows]})
        atomic_json(self.root / "diagnostics.json", report)
        if self.state.get("org_provisioned"):
            self.sql("update public.local_deployment_runtime set last_report=" + sql_json(report) + ",report_at=now() where org_id=" + sql_literal(self.state["org_id"]) + ";")
        print(json.dumps(report, indent=2))
        required = read_json(self.root / "release" / "manifest.json")["required_services"]
        states = {s["name"]: s["status"] for s in report["services"]}
        if any(states.get(name) != "healthy" for name in required):
            raise InstallError("UNHEALTHY_SERVICE", "A required service has not passed its health check.", "Review local container health, fix the cause, then run doctor again.")
        return report


def sql_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def sql_json(value):
    return sql_literal(json.dumps(value, ensure_ascii=False)) + "::jsonb"


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["install", "status", "doctor", "logs", "backup", "restore", "upgrade", "activate", "report", "import-data"])
    parser.add_argument("--root", type=Path, default=Path("/opt/kalamapp"))
    parser.add_argument("--bundle", type=Path)
    parser.add_argument("--trust-key", type=Path)
    parser.add_argument("--config", type=Path)
    parser.add_argument("--file", type=Path)
    parser.add_argument("--recipient-pub", type=Path)
    parser.add_argument("--recovery-key", type=Path)
    parser.add_argument("--backup-checksum")
    parser.add_argument("--replace-trial", action="store_true")
    parser.add_argument("--accept", action="store_true")
    args = parser.parse_args()
    try:
        if os.name != "posix": raise InstallError("LINUX_REQUIRED", "Run the installer on the Linux server.")
        import fcntl
        args.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        with (args.root / ".operation.lock").open("a") as lock:
            try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise InstallError("OPERATION_RUNNING", "Another operation is running for this installation.") from None
            installer = Installer(args.root, args.bundle)
            if args.command == "install":
                if not all((args.bundle, args.trust_key, args.config)): parser.error("install requires --bundle, --trust-key and --config")
                installer.install(args.trust_key, args.config, args.accept)
            elif args.command in ("doctor", "status"): installer.doctor()
            else:
                from maintenance import maintain
                maintain(installer, args)
    except InstallError as error:
        print(f"{error.code}: {error.message}\nNext step: {error.action}", file=sys.stderr)
        sys.exit(1)
    except (OSError, ValueError, KeyError):
        print("INVALID_CONFIGURATION: Check file permissions, configuration and the installation guide. No secret values are printed.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
