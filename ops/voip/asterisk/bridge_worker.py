#!/usr/bin/env python3
"""Platform-internal reconciler. Provider secrets never leave the database/Asterisk.
Only b_<bridge UUID>_* objects belong to this worker; legacy PBX objects are untouched.
"""
import json
import os
import re
import subprocess
import time


def bridge_ids(bridge_id):
    normalized = str(bridge_id).replace('-', '')
    if not re.fullmatch(r'[a-f0-9]{32}', normalized):
        raise ValueError('invalid_bridge_identity')
    return 'b_' + normalized + '_browser', 'b_' + normalized + '_provider'


def build_objects(row):
    browser, provider = bridge_ids(row['bridge_id'])
    metadata = row.get('metadata') or {}
    raw_host = str(metadata.get('server_url') or metadata.get('legacy_sip_host') or metadata.get('sip_domain') or '').strip()
    raw_host = re.sub(r'^sips?:', '', raw_host, flags=re.I)
    match = re.fullmatch(r'([A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?)(?::([0-9]{1,5}))?', raw_host)
    if not match:
        raise ValueError('invalid_sip_server')
    host = match[1].lower()
    port = int(metadata.get('sip_port') or match[2] or 5060)
    if not 0 < port <= 65535:
        raise ValueError('invalid_sip_port')
    transport = str(metadata.get('sip_transport') or 'udp').lower()
    if transport not in ('udp', 'tcp'):
        raise ValueError('unsupported_sip_transport')
    extension = str(row['extension']).strip()
    auth_username = str(metadata.get('auth_username') or extension).strip()
    domain = str(metadata.get('sip_domain') or host).strip()
    if not re.fullmatch(r'[A-Za-z0-9.-]+(?::[0-9]{1,5})?', domain):
        raise ValueError('invalid_sip_domain')
    if not re.fullmatch(r'[A-Za-z0-9_.+-]+', extension) or not auth_username or not row['sip_secret']:
        raise ValueError('invalid_sip_credentials')
    org = row['org_id']
    registrar = f'sip:{host}:{port};transport={transport}'
    common = dict(org_id=org, direct_media='no', force_rport='yes', rewrite_contact='yes', rtp_symmetric='yes',
                  disallow='all', identify_by='username,auth_username')
    objects = {
        'ps_aors': [dict(id=browser, org_id=org, max_contacts=1, remove_existing='yes', qualify_frequency=30),
                    dict(id=provider, org_id=org, contact=registrar, qualify_frequency=30)],
        'ps_auths': [dict(id=browser, org_id=org, auth_type='userpass', username=browser, password=row['browser_secret']),
                     dict(id=provider, org_id=org, auth_type='userpass', username=auth_username, password=row['sip_secret'])],
        'ps_endpoints': [
            dict(common, id=browser, transport='transport-wss', aors=browser, auth=browser, outbound_auth=None,
                 context='taze-external-out', allow='opus,alaw,ulaw', webrtc='yes', ice_support='yes',
                 dtls_auto_generate_cert='yes', dtls_verify='fingerprint', dtls_setup='actpass',
                 media_encryption='dtls', use_avpf='yes', media_use_received_transport='yes', rtcp_mux='yes'),
            dict(common, id=provider, transport='transport-' + transport, aors=provider, auth=None,
                 outbound_auth=provider, context='taze-external-in', allow='alaw,ulaw,opus', webrtc='no',
                 ice_support='no', dtls_auto_generate_cert='no', media_encryption='no', use_avpf='no',
                 media_use_received_transport='no', rtcp_mux='no', from_user=extension, from_domain=domain)],
        'ps_registrations': [dict(id=provider, org_id=org, transport='transport-' + transport,
                                  outbound_auth=provider, server_uri=registrar,
                                  client_uri=f'sip:{extension}@{domain}', contact_user=browser,
                                  retry_interval=60, forbidden_retry_interval=600, expiration=300,
                                  line='yes', endpoint=provider)]}
    return objects


def registration_status(output):
    if re.search(r'\b(?:Rejected|Stopped)\b', output, re.I):
        return 'rejected'
    if re.search(r'\b(?:Unregistered|Not Registered)\b', output, re.I):
        return 'pending'
    return 'registered' if re.search(r'\bRegistered\b', output) else 'pending'


def asterisk(command):
    result = subprocess.run(['asterisk', '-rx', command], capture_output=True, text=True, timeout=10)
    if result.returncode:
        raise RuntimeError('asterisk_command_failed')
    return result.stdout


def reconcile(connection):
    import psycopg2.extras
    import psycopg2.sql as sql
    with connection.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
        cursor.execute("""select b.id bridge_id,b.org_id,b.browser_secret,b.revision,b.synced_revision,
            a.extension,a.sip_secret,a.metadata from public.voip_provider_bridges b
            join public.voip_external_accounts a on a.id=b.account_id and a.org_id=b.org_id
            join public.user_organization_memberships m on m.user_id=a.assignee_profile_id and m.org_id=b.org_id
            where b.lease_until>now() and a.is_active and m.is_active
            and coalesce((m.settings->>'voip_enabled')::boolean,false)
            and coalesce(a.metadata->>'connection_strategy','auto')<>'direct'
            and public.org_has_plan_feature(b.org_id,'voip_webphone',true)
            and exists(select 1 from public.integration_settings i where i.org_id=b.org_id and i.connection_type='voip'
              and i.is_active and coalesce(i.settings->>'usage_mode',case when i.settings->>'default_dial_mode'='webphone_webrtc' then 'browser' else 'reports' end)='browser'
              and coalesce(i.settings->>'browser_source','external')='external')""")
        rows = cursor.fetchall()
        active_ids = []
        changed = False
        valid_rows = []
        for row in rows:
            try:
                objects = build_objects(row)
            except ValueError as error:
                cursor.execute("update public.voip_provider_bridges set registration_status='invalid_configuration',failure_code=%s,last_checked_at=now() where id=%s and org_id=%s", (str(error), row['bridge_id'], row['org_id']))
                continue
            browser, provider = bridge_ids(row['bridge_id'])
            active_ids.extend([browser, provider])
            valid_rows.append(row)
            if row['revision'] == row['synced_revision']:
                cursor.execute("""select (select count(*) from public.ps_endpoints where id=any(%s))
                    +(select count(*) from public.ps_auths where id=any(%s))
                    +(select count(*) from public.ps_aors where id=any(%s))
                    +(select count(*) from public.ps_registrations where id=%s) object_count""",
                    ([browser, provider], [browser, provider], [browser, provider], provider))
                if cursor.fetchone()['object_count'] == 7:
                    continue
            for table, records in objects.items():
                for record in records:
                    columns = list(record)
                    query = sql.SQL('insert into public.{} ({}) values ({}) on conflict(id) do update set {}').format(
                        sql.Identifier(table), sql.SQL(',').join(map(sql.Identifier, columns)),
                        sql.SQL(',').join(sql.Placeholder() for _ in columns),
                        sql.SQL(',').join(sql.SQL('{}=excluded.{}').format(sql.Identifier(key), sql.Identifier(key)) for key in columns if key != 'id'))
                    cursor.execute(query, [record[key] for key in columns])
            cursor.execute("update public.voip_provider_bridges set synced_revision=%s,registration_status='pending',failure_code=null where id=%s and org_id=%s", (row['revision'], row['bridge_id'], row['org_id']))
            changed = True
        # Covers expired leases, removed memberships/accounts, plan changes and strategy changes.
        for table in ['ps_registrations', 'ps_endpoints', 'ps_auths', 'ps_aors']:
            cursor.execute(sql.SQL("delete from public.{} where id ~ '^b_[a-f0-9]{{32}}_(browser|provider)$' and not(id=any(%s))").format(sql.Identifier(table)), (active_ids,))
            changed = changed or cursor.rowcount > 0
        cursor.execute("delete from public.ps_contacts where endpoint ~ '^b_[a-f0-9]{32}_browser$' and not(endpoint=any(%s))", (active_ids,))
        connection.commit()
        if changed:
            asterisk('module reload res_pjsip_outbound_registration.so')
        for row in valid_rows:
            _, provider = bridge_ids(row['bridge_id'])
            output = asterisk('pjsip show registration ' + provider)
            if 'Unable to find' in output:
                asterisk('module reload res_pjsip_outbound_registration.so')
                output = asterisk('pjsip show registration ' + provider)
            state = registration_status(output)
            cursor.execute('update public.voip_provider_bridges set registration_status=%s,last_checked_at=now() where id=%s and org_id=%s', (state, row['bridge_id'], row['org_id']))
        connection.commit()


def main():
    import psycopg2
    while True:
        connection = None
        try:
            with psycopg2.connect(host=os.environ['ASTERISK_PGSQL_HOST'], port=os.environ['ASTERISK_PGSQL_PORT'],
                                  dbname=os.environ['ASTERISK_PGSQL_DB'], user=os.environ['ASTERISK_PGSQL_USER'],
                                  password=os.environ['ASTERISK_PGSQL_PASSWORD'], connect_timeout=5) as connection:
                with connection.cursor() as cursor:
                    cursor.execute("select pg_try_advisory_lock(724031996)")
                    if not cursor.fetchone()[0]:
                        raise RuntimeError('another_bridge_worker_active')
                while True:
                    reconcile(connection)
                    time.sleep(3)
        except Exception as error:
            # Do not log SQL, parameter values, passwords or provider response bodies.
            print(json.dumps({'component': 'voip-bridge-worker', 'errorType': type(error).__name__}), flush=True)
            time.sleep(5)
        finally:
            if connection is not None:
                connection.close()


if __name__ == '__main__':
    main()
