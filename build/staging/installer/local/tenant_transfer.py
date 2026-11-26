"""Fail-closed tenant export using an explicit, release-reviewed table inventory.

No full database dumps, guessed org_id filtering, auth sessions, or cross-tenant
membership exports are allowed. PostgreSQL is accessed only through a private
libpq service; credentials never appear in command arguments or logs.
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.parse
import uuid
from common import InstallError, atomic_json, inside, read_json, run, sha256
from envelope import encrypt

FORBIDDEN_AUTH = {"sessions", "refresh_tokens", "mfa_challenges", "mfa_amr_claims", "flow_state", "one_time_tokens", "sso_domains", "sso_providers", "saml_providers", "saml_relay_states"}
USER_COLUMNS = {"id", "instance_id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "phone", "phone_confirmed_at", "created_at", "updated_at", "is_anonymous"}


def ident(value):
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", value): raise InstallError("INVALID_TABLE_RULE", "A transfer identifier is invalid.")
    return '"' + value + '"'


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def source_sql(sql, output=None):
    if not os.environ.get("PGSERVICE") or not os.environ.get("PGPASSFILE"):
        raise InstallError("EXPORT_SOURCE_UNCONFIGURED", "A private PostgreSQL service and password file must be configured.")
    password_file = Path(os.environ["PGPASSFILE"])
    if os.name == "posix" and password_file.stat().st_mode & 0o077:
        raise InstallError("INSECURE_PGPASS", "The PostgreSQL password file must have mode 0600.")
    if output is None:
        return run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"], input=sql.encode(), timeout=300)
    script = output.with_suffix(".sql")
    script.write_text(sql, encoding="utf-8"); os.chmod(script, 0o600)
    try:
        with output.open("xb") as stream:
            os.chmod(output, 0o600)
            process = subprocess.run(["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-f", str(script)], stdout=stream, stderr=subprocess.DEVNULL, timeout=7200)
        if process.returncode: raise InstallError("TENANT_SNAPSHOT_FAILED", "The consistent tenant snapshot failed.")
    finally: script.unlink(missing_ok=True)


SCHEMA_SQL = """select coalesce(jsonb_agg(x order by x.name),'[]') from (
select c.table_schema||'.'||c.table_name as name,jsonb_agg(c.column_name order by c.ordinal_position) as columns
from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
where c.table_schema in ('public','auth','storage') and t.table_type='BASE TABLE'
group by c.table_schema,c.table_name) x;"""


def validate_inventory(policy, schema):
    if policy.get("format") != "kalamapp-tenant-policy-v1": raise InstallError("TRANSFER_POLICY_REQUIRED", "A reviewed transfer policy is required.")
    rules = policy.get("tables", {})
    actual = {r["name"]: r["columns"] for r in schema}
    if set(rules) != set(actual): raise InstallError("UNCLASSIFIED_TABLES", "The live table inventory differs from the reviewed release.", "Classify every new or removed table and repeat transfer isolation tests.")
    for table, rule in rules.items():
        schema_name, name = table.split(".")
        ident(schema_name); ident(name)
        if rule.get("columns") != actual[table]: raise InstallError("SCHEMA_DRIFT", "The live columns differ from the reviewed transfer policy.")
        if rule.get("mode") == "exclude":
            if not rule.get("reason"): raise InstallError("EXCLUSION_REASON_REQUIRED", "Every excluded table requires a documented reason.")
            continue
        if table == 'public.profiles' and rule.get('mode') != 'profile':
            raise InstallError('UNSAFE_PROFILE_EXPORT', 'Shared users require organization-specific profile projections.')
        if table == 'storage.objects' and rule.get('mode') != 'storage':
            raise InstallError('UNSAFE_STORAGE_EXPORT', 'Storage must use an organization-specific key namespace.')
        if table == 'auth.identities' and rule.get('mode') != 'identities':
            raise InstallError('UNSAFE_IDENTITY_EXPORT', 'Identity metadata must use the restricted projection.')
        if rule.get('mode') == 'shared' and 'org_id' in rule['columns']:
            raise InstallError('UNSAFE_SHARED_TABLE', 'Tenant-owned tables cannot be exported as shared seeds.')
        protected = {column for column in rule['columns'] if re.search(r'(encrypted_|secret|credential)', column, re.I)}
        # Password hashes are preserved verbatim, never decrypted or re-encrypted.
        if table == 'auth.users': protected.discard('encrypted_password')
        described = {item['column'] for item in rule.get('secrets', [])}
        if protected - described:
            raise InstallError('SECRET_ADAPTER_REQUIRED', 'Every protected column requires an explicit migration adapter.')
        if schema_name == "auth" and (name in FORBIDDEN_AUTH or name.startswith("mfa_")):
            raise InstallError("AUTH_STATE_NOT_PORTABLE", "Sessions and MFA state cannot be silently copied or removed.")
        if table == "auth.users" and (rule.get("mode") != "auth_users" or not set(rule.get("export_columns", [])).issubset(USER_COLUMNS) or not {"id", "encrypted_password"}.issubset(rule.get("export_columns", []))):
            raise InstallError("UNSAFE_AUTH_EXPORT", "The auth user column allowlist is invalid.")
        if table == "public.user_organization_memberships" and rule.get("mode") != "org":
            raise InstallError("UNSAFE_MEMBERSHIP_EXPORT", "Only the selected organization's memberships may be exported.")
        if rule.get("mode") not in {"org", "parent", "organization", "members", "profile", "storage", "auth_users", "identities", "shared"}:
            raise InstallError("UNKNOWN_TABLE_RULE", "A table has no supported tenant selector.")
        if rule.get("mode") == "shared" and not rule.get("reason"):
            raise InstallError("UNSAFE_SHARED_TABLE", "Shared seed data requires a reviewed justification.")
    if rules.get("public.user_organization_memberships", {}).get("mode") != "org" or rules.get("auth.users", {}).get("mode") != "auth_users":
        raise InstallError("IDENTITY_POLICY_REQUIRED", "The policy must explicitly preserve scoped memberships and password hashes.")


def selector(table, rules, org_id, alias="t", seen=()):
    if table in seen or len(seen) > 12: raise InstallError("CYCLIC_TENANT_SELECTOR", "A table selector is cyclic or too deep.")
    rule = rules[table]; mode = rule["mode"]
    if mode == "org": return f"{alias}.{ident(rule.get('org_column', 'org_id'))}={literal(org_id)}::uuid"
    if mode == "organization": return f"{alias}.id={literal(org_id)}::uuid"
    if mode in ("auth_users", "members", "profile", "identities"):
        column = "user_id" if mode == "identities" else "id"
        return f"{alias}.{ident(column)} in (select user_id from public.user_organization_memberships where org_id={literal(org_id)}::uuid)"
    if mode == "storage": return f"{alias}.name like {literal(org_id + '/%')}"
    if mode == "shared": return "true"  # Explicitly approved immutable seed table, never a tenant RLS policy.
    if mode == "parent":
        parent = rule["parent"]; schema, name = parent.split("."); pa = "p" + str(len(seen))
        return f"exists(select 1 from {ident(schema)}.{ident(name)} {pa} where {pa}.{ident(rule.get('parent_key','id'))}={alias}.{ident(rule['foreign_key'])} and {selector(parent, rules, org_id, pa, (*seen,table))})"
    raise InstallError("NO_TENANT_SELECTOR", "An exported table has no tenant selector.")


def export_query(table, rule, rules, org_id):
    schema, name = table.split(".")
    if rule["mode"] == "auth_users":
        fields = ",".join(f"{literal(column)},{'t.' + ident(column)}" for column in rule["export_columns"])
        value = f"jsonb_build_object({fields})"
    elif rule["mode"] == "identities":
        # Identity metadata can include profiles or OAuth details unrelated to this organization.
        value = "to_jsonb(t)-'identity_data'||jsonb_build_object('identity_data',jsonb_build_object('sub',t.user_id::text,'email',t.identity_data->>'email','phone',t.identity_data->>'phone'))"
    elif rule["mode"] == "profile":
        allowed = {"id", "full_name", "email", "mobile", "mobile_1", "avatar_url", "created_at", "updated_at"}
        fields = ','.join(f"{literal(c)},t.{ident(c)}" for c in rule['columns'] if c in allowed)
        value = f"jsonb_build_object({fields})||jsonb_build_object('org_id',{literal(org_id)}::uuid,'role_id',(select role_id from public.user_organization_memberships where user_id=t.id and org_id={literal(org_id)}::uuid),'role',(select software_role from public.user_organization_memberships where user_id=t.id and org_id={literal(org_id)}::uuid))"
    else: value = "to_jsonb(t)"
    return f"select jsonb_build_object('table',{literal(table)},'row',{value}) from {ident(schema)}.{ident(name)} t where {selector(table,rules,org_id)};"


def export_tenant(context, work, client, lease):
    install, release, job = context["installation"], context["release"], context["job"]
    from common import verify_release
    release_root = Path(os.environ["KALAMAPP_RELEASES_ROOT"]) / str(uuid.UUID(release["id"]))
    manifest = verify_release(release_root, Path(os.environ["KALAMAPP_TRUST_KEY"]))
    if manifest.get("checks", {}).get("tenant_transfer") != "passed": raise InstallError("TRANSFER_NOT_ACCEPTED", "Tenant migration has not passed release acceptance.")
    policy_path = manifest.get("transfer_policy")
    if policy_path not in manifest["files"]: raise InstallError("TRANSFER_POLICY_REQUIRED", "The signed release has no reviewed transfer inventory.")
    policy = read_json(inside(release_root, policy_path))
    lease.stage("inventory", "جدول‌ها، عضویت‌ها و محدودهٔ داده‌های مشتری بررسی می‌شوند.")
    schema = json.loads(source_sql(SCHEMA_SQL))
    validate_inventory(policy, schema)
    org_id = str(uuid.UUID(install["customer_org_id"]))
    # Do not silently disable MFA. A separate reviewed MFA migration would be needed.
    if source_sql(f"select count(*) from auth.mfa_factors where user_id in (select user_id from public.user_organization_memberships where org_id={literal(org_id)}::uuid);").strip() != "0":
        raise InstallError("MFA_REQUIRES_REVIEW", "MFA users require an explicitly tested migration path; export was stopped.")
    credentials = client.request('/rest/v1/saas_local_credentials?installation_id=eq.' + install['id'] + '&select=recovery_public_key', method='GET')
    recipient = credentials[0].get('recovery_public_key') if credentials else None
    if not recipient: raise InstallError("CUSTOMER_RECOVERY_KEY_REQUIRED", "Register this customer's recovery public key before exporting.")
    if job["kind"] == "export_final":
        lease.stage("freeze", "توقف امن تغییرات و کارهای خودکار مشتری بررسی می‌شود.")
        if not policy.get("write_fence_verified") or not policy.get("egress_fence_verified") or not policy.get("storage_fence_verified"):
            raise InstallError("CUTOVER_FENCE_NOT_ACCEPTED", "Database, storage and outbound-work fences must all be tested.")
        # Trusted release-owned SQL must drain the worker queues before the final fence.
        drain = manifest.get("transfer_drain_sql")
        if drain not in manifest["files"]: raise InstallError("DRAIN_CHECK_REQUIRED", "The signed release has no worker-drain check.")
        source_sql(inside(release_root, drain).read_text(encoding="utf-8"))
        source_sql(f"""begin;
select pg_advisory_xact_lock(hashtext({literal(org_id)}));
do $$ begin
if exists(select 1 from public.saas_local_transfer_locks where org_id={literal(org_id)}::uuid and installation_id<>{literal(install['id'])}::uuid) then raise exception 'Another installation owns the source fence'; end if;
end $$;
update public.saas_org_settings set is_readonly=true where org_id={literal(org_id)}::uuid and not exists(select 1 from public.saas_local_transfer_locks where org_id={literal(org_id)}::uuid);
insert into public.saas_local_transfer_locks(org_id,installation_id,state) values({literal(org_id)}::uuid,{literal(install['id'])}::uuid,'frozen') on conflict(org_id) do nothing;
commit;""")
        # A failure from here leaves the source frozen; it is never silently reactivated.
    lease.stage("snapshot", "خروجی سازگار اطلاعات و حساب‌های همین سازمان تهیه می‌شود.")
    snapshot = work / "rows.ndjson"
    statements = ["begin isolation level repeatable read read only;", "select jsonb_build_object('schema',(" + SCHEMA_SQL.strip().rstrip(';') + ")); "]
    for table, rule in policy["tables"].items():
        if rule["mode"] != "exclude": statements.append(export_query(table, rule, policy["tables"], org_id))
    statements.append("commit;")
    source_sql("\n".join(statements), snapshot)
    counts = {}
    objects = []
    transformed = work / 'transformed.ndjson'
    from secret_adapters import export_secrets
    with snapshot.open(encoding="utf-8") as stream, transformed.open('x', encoding='utf-8') as output:
        os.chmod(transformed, 0o600)
        actual_schema = json.loads(next(stream))["schema"]
        validate_inventory(policy, actual_schema)
        for line in stream:
            record = json.loads(line); table = record["table"]
            record['row'] = export_secrets(record['row'], policy['tables'][table].get('secrets', []))
            output.write(json.dumps(record, ensure_ascii=False) + '\n')
            counts[table] = counts.get(table, 0) + 1
            if table == "storage.objects": objects.append(record["row"])
    os.replace(transformed, snapshot)
    files = []
    for item in objects:
        lease.ensure()
        path = item.get("name", ""); bucket = item["bucket_id"]
        target = work / "files" / (str(uuid.UUID(item["id"])))
        target.parent.mkdir(mode=0o700, exist_ok=True)
        client.download_storage(bucket, path, target)
        files.append({"bucket": bucket, "name": path, "file": target.relative_to(work).as_posix(), "checksum": sha256(target)})
    snapshot_manifest = {"format": "kalamapp-tenant-snapshot-v1", "installation_id": install["id"], "org_id": org_id,
        "version": release["version"], "schema_version": release["schema_version"], "auth_version": manifest["auth_version"],
        "kind": job["kind"], "counts": counts, "files": files, "rows_checksum": sha256(snapshot),
        "policy_checksum": sha256(inside(release_root, policy_path)), "created_at": datetime.now(timezone.utc).isoformat()}
    atomic_json(work / "snapshot.json", snapshot_manifest)
    plaintext = work / "snapshot.tar.gz"
    with tarfile.open(plaintext, "w:gz") as archive:
        for name in ["rows.ndjson", "snapshot.json", *[f["file"] for f in files]]:
            archive.add(inside(work, name), arcname=name, recursive=False)
    lease.stage("encrypt", "خروجی با کلید بازیابی اختصاصی مشتری رمزگذاری می‌شود.")
    encrypted = work / "snapshot.enc"
    encrypt(plaintext, encrypted, recipient.encode())
    signing_key = Path(os.environ["KALAMAPP_TRANSFER_SIGNING_KEY"])
    (work / 'snapshot.sha256').write_text(sha256(encrypted), encoding='ascii')
    run(["openssl", "pkeyutl", "-sign", "-rawin", "-inkey", signing_key, "-in", work / 'snapshot.sha256', "-out", work / "snapshot.sig"])
    artifact = work / "transfer.tar"
    with tarfile.open(artifact, "w") as archive:
        for name in ("snapshot.enc", "snapshot.sig", "snapshot.sha256"): archive.add(work / name, arcname=name, recursive=False)
    lease.stage("upload", "خروجی رمزگذاری‌شده در فضای خصوصی ثبت می‌شود.")
    object_path = f"{install['org_id']}/{install['id']}/{job['id']}/transfer.tar"
    client.upload(artifact, object_path)
    lease.ensure()
    return {"artifact_path": object_path, "checksum": sha256(artifact), "version": release["version"], "restore_verified": False,
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()}
