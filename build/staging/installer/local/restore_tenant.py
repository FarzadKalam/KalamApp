"""Restore a signed tenant snapshot into a dedicated inactive installation only."""
from __future__ import annotations
import base64
import getpass
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from common import InstallError, atomic_json, inside, read_json, run, sha256
from envelope import decrypt
from maintenance import backup, safe_extract, stop_application
from secret_adapters import import_secrets
from tenant_transfer import ident, literal, selector


def restore_tenant(installer, args):
    if not args.file or not args.recovery_key:
        raise InstallError('TRANSFER_INPUT_REQUIRED', 'import-data requires --file and --recovery-key.')
    if installer.state['config']['install_kind'] != 'migration' or installer.state.get('phase') == 'active':
        raise InstallError('INACTIVE_TARGET_REQUIRED', 'Import is permitted only into an inactive migration target.')
    manifest = read_json(installer.root / 'release' / 'manifest.json')
    policy = read_json(inside(installer.root / 'release', manifest['transfer_policy']))
    signer_path = manifest.get('transfer_signer')
    if signer_path not in manifest['files']:
        raise InstallError('TRANSFER_SIGNER_REQUIRED', 'The signed release must delegate a transfer signing key.')
    if installer.state.get('snapshot_kind') and not args.replace_trial:
        raise InstallError('REPLACE_TRIAL_CONFIRMATION_REQUIRED', 'This target already contains an imported snapshot. Use --replace-trial after reviewing the trial data.')
    if input('Import this customer snapshot? Type the installation code: ') != installer.state['code']:
        raise InstallError('CANCELLED', 'Tenant import cancelled.')
    with tempfile.TemporaryDirectory(dir=installer.root / 'private', prefix='tenant-restore-') as folder:
        work = Path(folder)
        safe_extract(args.file, work / 'envelope')
        encrypted = work / 'envelope' / 'snapshot.enc'
        expected = (work / 'envelope' / 'snapshot.sha256').read_text(encoding='ascii')
        if expected != sha256(encrypted): raise InstallError('TRANSFER_DAMAGED', 'The encrypted snapshot checksum is invalid.')
        run(['openssl', 'pkeyutl', '-verify', '-rawin', '-pubin', '-inkey', inside(installer.root / 'release', signer_path), '-in', work / 'envelope' / 'snapshot.sha256', '-sigfile', work / 'envelope' / 'snapshot.sig'])
        key_password = getpass.getpass('Customer recovery key password: ').encode() or None
        private_key = args.recovery_key.read_bytes()
        decrypt(encrypted, work / 'snapshot.tar.gz', private_key, key_password)
        safe_extract(work / 'snapshot.tar.gz', work / 'snapshot')
        source = read_json(work / 'snapshot' / 'snapshot.json')
        if source.get('format') != 'kalamapp-tenant-snapshot-v1' or source['org_id'] != installer.state['org_id'] or source['installation_id'] != installer.state['config'].get('installation_id'):
            raise InstallError('WRONG_TENANT_SNAPSHOT', 'The snapshot belongs to another customer installation.')
        if source['version'] != installer.state['version'] or source['schema_version'] != manifest['schema_version'] or source['auth_version'] != manifest['auth_version']:
            raise InstallError('TRANSFER_VERSION_MISMATCH', 'Application, schema and auth versions must match the source snapshot.')
        if source['policy_checksum'] != sha256(inside(installer.root / 'release', manifest['transfer_policy'])):
            raise InstallError('TRANSFER_POLICY_MISMATCH', 'The snapshot uses another table policy.')
        rows = work / 'snapshot' / 'rows.ndjson'
        if sha256(rows) != source['rows_checksum']: raise InstallError('ROW_CHECKSUM_MISMATCH', 'The snapshot rows are damaged.')
        for entry in source['files']:
            if sha256(inside(work / 'snapshot', entry['file'])) != entry['checksum']:
                raise InstallError('STORAGE_CHECKSUM_MISMATCH', 'A customer file is damaged.')
        if installer.state.get('snapshot_kind'):
            if source['kind'] != 'export_final' or installer.state['snapshot_kind'] != 'export_trial':
                raise InstallError('INVALID_REPLACEMENT', 'Only an inactive trial can be replaced by its final snapshot.')
            from cryptography.hazmat.primitives import serialization
            owner_key = serialization.load_pem_private_key(private_key, password=key_password)
            public_path = work / 'recipient.pub'
            public_path.write_bytes(owner_key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo))
            backups = installer.root / 'backups'; backups.mkdir(exist_ok=True, mode=0o700)
            backup(installer, public_path, backups / ('before-final-' + os.urandom(6).hex() + '.enc'))
        stop_application(installer)
        installer.save(recovery_required=True)
        sql_path = work / 'import.sql'
        local_keys = read_json(installer.root / 'private' / 'secrets.json')
        counts = {}
        with sql_path.open('x', encoding='utf-8') as sql:
            os.chmod(sql_path, 0o600)
            sql.write('begin; set local session_replication_role=replica;\n')
            if installer.state.get('snapshot_kind'):
                for table, rule in reversed(list(policy['tables'].items())):
                    if rule['mode'] in ('exclude', 'shared', 'auth_users', 'identities', 'profile'): continue
                    schema, name = table.split('.')
                    sql.write(f'delete from {ident(schema)}.{ident(name)} t where {selector(table, policy["tables"], source["org_id"])};\n')
            with rows.open(encoding='utf-8') as incoming:
                for line in incoming:
                    record = json.loads(line); table = record['table']
                    rule = policy['tables'].get(table)
                    if not rule or rule['mode'] == 'exclude': raise InstallError('UNEXPECTED_TABLE', 'The snapshot includes an unapproved table.')
                    row = import_secrets(record['row'], rule.get('secrets', []), local_keys)
                    if not set(row).issubset(set(rule['columns'])): raise InstallError('UNEXPECTED_COLUMN', 'The snapshot includes an unapproved column.')
                    schema, name = table.split('.')
                    columns = list(row)
                    values = ','.join('r.' + ident(c) for c in columns)
                    # Existing shared seeds and auth IDs may be present only in an inactive trial.
                    conflict = ' do nothing' if rule['mode'] == 'shared' else ' do update set ' + ','.join(f'{ident(c)}=excluded.{ident(c)}' for c in columns)
                    pk = rule.get('primary_key')
                    if not pk: raise InstallError('PRIMARY_KEY_POLICY_REQUIRED', 'Every imported table requires an explicit primary key.')
                    sql.write(f'insert into {ident(schema)}.{ident(name)}({",".join(ident(c) for c in columns)}) overriding system value select {values} from jsonb_populate_record(null::{ident(schema)}.{ident(name)},{literal(json.dumps(row,ensure_ascii=False))}::jsonb) r on conflict({",".join(ident(c) for c in pk)}){conflict};\n')
                    counts[table] = counts.get(table, 0) + 1
            if counts != source['counts']: raise InstallError('ROW_COUNT_MISMATCH', 'The snapshot row inventory is inconsistent.')
            # Restore all FK enforcement before the transaction commits. Replica mode alone does not validate past rows.
            sql.write('set local session_replication_role=origin;\n')
            sql.write("""do $$ declare f record; bad boolean; predicate text; begin
for f in select con.oid,con.conrelid::regclass child,con.confrelid::regclass parent,con.conkey,con.confkey
from pg_constraint con join pg_namespace n on n.oid=con.connamespace where con.contype='f' and n.nspname in ('public','auth','storage') loop
 select string_agg(format('c.%I=p.%I',ca.attname,pa.attname),' and ') into predicate
 from unnest(f.conkey,f.confkey) x(ca,pa) join pg_attribute ca on ca.attrelid=f.child and ca.attnum=x.ca join pg_attribute pa on pa.attrelid=f.parent and pa.attnum=x.pa;
 execute format('select exists(select 1 from %s c where %s and not exists(select 1 from %s p where %s))',f.child,
 (select string_agg(format('c.%I is not null',a.attname),' and ') from unnest(f.conkey) k join pg_attribute a on a.attrelid=f.child and a.attnum=k),f.parent,predicate) into bad;
 if bad then raise exception 'Tenant restore foreign key validation failed'; end if;
end loop; end $$;\ncommit;\n""")
        command = ['docker', 'compose', '--project-name', installer.state['project'], '--env-file', str(installer.env), '-f', str(installer.root / 'release' / 'compose.yml'), 'exec', '-T', 'db', 'psql', '-X', '-q', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']
        with sql_path.open('rb') as sql:
            process = subprocess.run(command, stdin=sql, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=7200)
        if process.returncode: raise InstallError('TENANT_RESTORE_FAILED', 'The tenant restore transaction failed. Services remain stopped for review.')
        # Rebind only this organization's domain and local policy after restoring cloud settings.
        installer.bind_org(manifest)
        post_import = manifest.get('post_import_sql')
        if post_import not in manifest['files']: raise InstallError('POST_IMPORT_POLICY_REQUIRED', 'A signed post-import job and integration policy is required.')
        installer.sql(inside(installer.root / 'release', post_import).read_text(encoding='utf-8'))
        # Storage keys are written through the local storage API after metadata restoration.
        installer.compose('up', '-d', '--pull', 'never', '--no-build', '--wait', '--wait-timeout', '240', timeout=300)
        for entry in source['files']:
            upload_file(installer, entry['bucket'], entry['name'], inside(work / 'snapshot', entry['file']))
        installer.save(snapshot_kind=source['kind'], snapshot_checksum=sha256(args.file), recovery_required=False, phase='trial' if source['kind']=='export_trial' else 'awaiting_cutover', maintenance=False)
        installer.doctor()
        email = input('Migrated user email for password verification: ').strip()
        login = installer.request('/auth/v1/token?grant_type=password', {'email': email, 'password': getpass.getpass('Existing cloud password (not stored): ')})
        if not login.get('user', {}).get('id'): raise InstallError('PASSWORD_LOGIN_NOT_VERIFIED', 'The migrated account password login could not be verified.')
        from cli import sql_literal
        if installer.sql('select count(*) from public.user_organization_memberships where is_active and user_id=' + sql_literal(login['user']['id']) + '::uuid and org_id=' + sql_literal(source['org_id']) + '::uuid;').strip() != '1':
            raise InstallError('LOGIN_ORG_MISMATCH', 'The verified user does not belong to the imported organization.')
        receipt = {'format': 'kalamapp-restore-receipt-v1', 'installation_id': source['installation_id'], 'checksum': sha256(args.file), 'version': source['version'], 'password_login': 'passed', 'data_integrity': 'passed'}
        payload = json.dumps(receipt, sort_keys=True, separators=(',', ':')).encode()
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding
        owner_key = serialization.load_pem_private_key(private_key, password=key_password)
        signature = owner_key.sign(payload, padding.PSS(mgf=padding.MGF1(hashes.SHA256()), salt_length=32), hashes.SHA256())
        atomic_json(installer.root / 'restore-receipt.json', {'payload': base64.b64encode(payload).decode(), 'signature': base64.b64encode(signature).decode()})
        print('Restore and existing password verified. Import restore-receipt.json into the central installation record. Outbound operations remain disabled.')


def upload_file(installer, bucket, name, source):
    import http.client
    import ssl
    import urllib.parse
    values = read_json(installer.root / 'private' / 'secrets.json')
    parsed = urllib.parse.urlsplit(installer.state['public_url'])
    context = ssl.create_default_context()
    ca = installer.root / 'private' / 'tls' / 'ca.crt'
    if ca.is_file(): context.load_verify_locations(cafile=str(ca))
    connection = http.client.HTTPSConnection(parsed.hostname, parsed.port, context=context, timeout=120)
    try:
        path = '/storage/v1/object/' + urllib.parse.quote(bucket, safe='') + '/' + urllib.parse.quote(name, safe='/')
        connection.putrequest('POST', path)
        for key, value in {'Authorization': 'Bearer ' + values['SERVICE_ROLE_KEY'], 'apikey': values['ANON_KEY'], 'Content-Type': 'application/octet-stream', 'Content-Length': str(source.stat().st_size), 'x-upsert': 'true'}.items(): connection.putheader(key, value)
        connection.endheaders()
        with source.open('rb') as stream:
            while chunk := stream.read(1024 * 1024): connection.send(chunk)
        response = connection.getresponse(); response.read(65536)
        if response.status not in (200, 201): raise InstallError('STORAGE_RESTORE_FAILED', 'A tenant file could not be restored.')
    finally: connection.close()
