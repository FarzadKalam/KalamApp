"""Tenant-scoped AI call jobs and listen-only operator access. No credentials in logs."""
import base64
import io
import json
import os
from pathlib import Path
import re
import shutil
import socketserver
import subprocess
import threading
import time
import urllib.request
import uuid
import wave


def connect():
    import psycopg2
    return psycopg2.connect(host=os.environ['ASTERISK_PGSQL_HOST'], port=os.environ['ASTERISK_PGSQL_PORT'],
                            dbname=os.environ['ASTERISK_PGSQL_DB'], user=os.environ['ASTERISK_PGSQL_USER'],
                            password=os.environ['ASTERISK_PGSQL_PASSWORD'], connect_timeout=5)


def query(sql, values=()):
    import psycopg2.extras
    with connect() as db:
        with db.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(sql, values)
            return cursor.fetchall() if cursor.description else []


def asterisk(command, timeout=10):
    result = subprocess.run(['asterisk', '-rx', command], text=True, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('asterisk_command_failed')
    return result.stdout


def voice_turn(session_id, audio=None):
    url = os.environ['KALAMAPP_WEBHOOK_URL'].rsplit('/', 1)[0] + '/voip-ai-session'
    body = dict(action='worker_turn', sessionId=session_id)
    if audio:
        body['audio'] = dict(data=base64.b64encode(audio).decode())
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
        'Content-Type': 'application/json', 'x-kalam-voip-secret': os.environ['KALAMAPP_VOIP_INTERNAL_SECRET'],
        **({'apikey': os.environ['KALAMAPP_VOIP_API_KEY']} if os.environ.get('KALAMAPP_VOIP_API_KEY') else {})})
    with urllib.request.urlopen(request, timeout=90) as response:
        data = json.load(response)
    if not data.get('success'):
        raise RuntimeError('customer_agent_turn_failed')
    return base64.b64decode(data['audioBase64'])


def write_phone_wav(data, path):
    import audioop
    import pwd
    with wave.open(io.BytesIO(data), 'rb') as source:
        audio = source.readframes(source.getnframes())
        width, channels, rate = source.getsampwidth(), source.getnchannels(), source.getframerate()
    if channels == 2:
        audio = audioop.tomono(audio, width, 0.5, 0.5)
    elif channels != 1:
        raise ValueError('unsupported_voice_channels')
    if width != 2:
        audio = audioop.lin2lin(audio, width, 2)
    audio, _ = audioop.ratecv(audio, 2, 1, rate, 8000, None)
    with wave.open(str(path), 'wb') as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(8000)
        target.writeframes(audio)
    owner = pwd.getpwnam('asterisk')
    os.chown(path, owner.pw_uid, owner.pw_gid)
    path.chmod(0o600)


ROOT = Path('/var/spool/asterisk/ai-calls')


def folder_for(session_id):
    clean = str(uuid.UUID(str(session_id)))
    folder = ROOT / clean
    if folder.resolve().parent != ROOT.resolve():
        raise ValueError('invalid_call_path')
    return folder


class VoiceAGI(socketserver.StreamRequestHandler):
    def command(self, command):
        self.wfile.write((command + '\n').encode())
        self.wfile.flush()
        result = self.rfile.readline().decode().strip()
        if not result.startswith('200 result=') or result.startswith('200 result=-1'):
            raise RuntimeError('call_ended')
        return result

    def handle(self):
        import audioop
        session_id = None
        try:
            env = {}
            while True:
                line = self.rfile.readline().decode().strip()
                if not line:
                    break
                key, _, value = line.partition(':')
                env[key] = value.strip()
            script = env.get('agi_network_script', '')
            if script.startswith('join/'):
                self.join(script[5:], env.get('agi_arg_1', ''))
                return
            if not script.startswith('voice/'):
                return
            session_id = str(uuid.UUID(script[6:]))
            rows = query("select * from public.voip_ai_sessions where id=%s and status='dialing'", (session_id,))
            if not rows:
                return
            job = rows[0]
            self.command('SET VARIABLE TIMEOUT(absolute) ' + str(min(600, max(30, job['max_duration_seconds']))))
            channel = env.get('agi_channel', '')
            expected = 'PJSIP/b_' + str(job['bridge_id']).replace('-', '') + '_provider-'
            if not re.fullmatch(re.escape(expected) + '[0-9a-f]+', channel):
                raise ValueError('wrong_voice_channel')
            query("update public.voip_ai_sessions set status='active',channel_name=%s,started_at=now(),heartbeat_at=now() where id=%s and status='dialing'", (channel, session_id))
            folder = folder_for(session_id)
            self.command(f'STREAM FILE {folder}/greeting ""')
            deadline = time.monotonic() + job['max_duration_seconds']
            silence_count = 0
            while time.monotonic() < deadline:
                if not query("select id from public.voip_ai_sessions where id=%s and status='active'", (session_id,)):
                    break
                query('update public.voip_ai_sessions set heartbeat_at=now() where id=%s', (session_id,))
                source = folder / 'input.wav'
                self.command(f'RECORD FILE {folder}/input wav "" 12000 0 s=2')
                if not source.exists():
                    break
                with wave.open(str(source), 'rb') as recording:
                    frames = recording.readframes(recording.getnframes())
                if len(frames) < 3200 or audioop.rms(frames, 2) < 100:
                    silence_count += 1
                    if silence_count > 6:
                        break
                    continue
                silence_count = 0
                audio = source.read_bytes()
                source.unlink(missing_ok=True)
                output = voice_turn(session_id, audio)
                write_phone_wav(output, folder / 'reply.wav')
                self.command(f'STREAM FILE {folder}/reply ""')
            query("update public.voip_ai_sessions set status='completed',ended_at=now(),channel_name=null where id=%s and status='active'", (session_id,))
        except Exception as error:
            print(json.dumps({'component': 'customer-voice-agi', 'errorType': type(error).__name__}), flush=True)
            if session_id:
                normal_end = str(error) == 'call_ended'
                query("update public.voip_ai_sessions set status=case when status='cancelled' then status else %s end,failure_code=%s,ended_at=now(),channel_name=null where id=%s and status in ('dialing','active','cancelled')", ('completed' if normal_end else 'failed', None if normal_end else 'voice_runtime_error', session_id))
        finally:
            if session_id:
                folder = folder_for(session_id)
                if folder.exists() and folder.resolve().parent == ROOT.resolve():
                    shutil.rmtree(folder)

    def join(self, code, endpoint):
        # The endpoint is supplied by Asterisk CHANNEL(endpoint), never a caller's SIP header.
        if not re.fullmatch(r'\*88\*[0-9]{16}', code) or not re.fullmatch(r'b_[0-9a-f]{32}_browser', endpoint):
            return
        bridge = str(uuid.UUID(endpoint[2:-8]))
        rows = query("""select s.channel_name from public.voip_ai_sessions s
          join public.voip_provider_bridges b on b.id=%s and b.org_id=s.org_id
          join public.voip_external_accounts a on a.id=b.account_id and a.org_id=s.org_id
          join public.user_organization_memberships m on m.user_id=a.assignee_profile_id and m.org_id=s.org_id and m.is_active
          left join public.org_roles r on r.id=m.role_id and r.org_id=m.org_id
          where s.join_code=%s and s.status='active' and a.is_active
          and coalesce((r.permissions->'voip_call_reports'->>'view')::boolean,true)
          and (s.requested_by=m.user_id or coalesce((r.permissions->'__settings_tabs'->>'edit')::boolean,false))
          limit 1""", (bridge, code[4:]))
        channel = rows[0]['channel_name'] if rows else ''
        if not re.fullmatch(r'PJSIP/b_[0-9a-f]{32}_provider-[0-9a-f]+', channel or ''):
            return
        self.command('SET VARIABLE VOICE_TARGET "' + channel + '"')
        self.command('SET VARIABLE VOICE_ALLOWED 1')


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def handle_error(self, request, client_address):
        print(json.dumps({'component': 'customer-voice-agi', 'errorType': 'RequestFailed'}), flush=True)


def prepare_job(job):
    import pwd
    session_id = str(job['id'])
    try:
        if not re.fullmatch(r'\+?[0-9]{7,15}', job['phone']):
            raise ValueError('bad_destination')
        account = query('select assignee_profile_id from public.voip_external_accounts where id=%s and org_id=%s and is_active and metadata->>\'ai_dedicated\'=\'true\'', (job['account_id'], job['org_id']))
        if not account:
            raise ValueError('dedicated_account_missing')
        bridge = query('select public.prepare_voip_provider_bridge(%s,%s) as data', (job['org_id'], account[0]['assignee_profile_id']))[0]['data']
        bridge_id = str(bridge['id'])
        query('update public.voip_ai_sessions set bridge_id=%s,heartbeat_at=now() where id=%s', (bridge_id, session_id))
        folder = folder_for(session_id)
        folder.mkdir(parents=True, exist_ok=True)
        owner = pwd.getpwnam('asterisk')
        os.chown(folder, owner.pw_uid, owner.pw_gid)
        folder.chmod(0o700)
        write_phone_wav(voice_turn(session_id), folder / 'greeting.wav')
        ready = False
        for _ in range(15):
            row = query('select registration_status from public.voip_provider_bridges where id=%s', (bridge_id,))
            if row and row[0]['registration_status'] == 'registered':
                ready = True
                break
            time.sleep(2)
        if not ready:
            raise RuntimeError('provider_not_registered')
        changed = query("update public.voip_ai_sessions set status='dialing',heartbeat_at=now() where id=%s and status='preparing' returning id", (session_id,))
        if not changed:
            return
        provider = 'b_' + bridge_id.replace('-', '') + '_provider'
        asterisk(f'channel originate PJSIP/{job["phone"]}@{provider} extension {session_id}@taze-ai-customer', timeout=40)
    except Exception as error:
        print(json.dumps({'component': 'customer-voice-prepare', 'errorType': type(error).__name__}), flush=True)
        query("update public.voip_ai_sessions set status='failed',failure_code='voice_prepare_failed',ended_at=now() where id=%s and status in ('preparing','dialing')", (session_id,))
    finally:
        current = query('select status from public.voip_ai_sessions where id=%s', (session_id,))
        if current and current[0]['status'] in ['failed', 'cancelled']:
            folder = folder_for(session_id)
            if folder.exists() and folder.resolve().parent == ROOT.resolve():
                shutil.rmtree(folder)


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    server = Server(('127.0.0.1', 45732), VoiceAGI)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    with connect() as lock:
        with lock.cursor() as cursor:
            cursor.execute('select pg_try_advisory_lock(724031997)')
            if not cursor.fetchone()[0]:
                raise RuntimeError('another_voice_worker_active')
        while True:
            try:
                query("insert into public.voip_ai_worker_health(id,checked_at) values('asterisk-voice',now()) on conflict(id) do update set checked_at=now()")
                query("update public.voip_provider_bridges b set lease_until=now()+interval '5 minutes' from public.voip_ai_sessions s where s.bridge_id=b.id and s.org_id=b.org_id and s.status in ('preparing','dialing','active')")
                query("update public.voip_ai_sessions set status='cancelled',failure_code='duration_limit',ended_at=now() where status='active' and started_at+make_interval(secs=>max_duration_seconds+30)<now()")
                rows = query("""update public.voip_ai_sessions set status='preparing',heartbeat_at=now()
                 where (select count(*) from public.voip_ai_sessions where status in ('preparing','dialing','active'))<8
                 and id=(select id from public.voip_ai_sessions where status='queued' order by created_at for update skip locked limit 1)
                 returning *""")
                for job in rows:
                    threading.Thread(target=prepare_job, args=(job,), daemon=True).start()
                cancelled = query("select id,channel_name from public.voip_ai_sessions where status='cancelled' and channel_name is not null")
                for job in cancelled:
                    if re.fullmatch(r'PJSIP/b_[0-9a-f]{32}_provider-[0-9a-f]+', job['channel_name'] or ''):
                        asterisk('channel request hangup ' + job['channel_name'])
                    query('update public.voip_ai_sessions set channel_name=null where id=%s', (job['id'],))
                query("update public.voip_ai_sessions set status='failed',failure_code='call_not_answered',ended_at=now() where status='dialing' and heartbeat_at<now()-interval '90 seconds'")
                query("update public.voip_ai_sessions set status='failed',failure_code='worker_stale',ended_at=now() where status='preparing' and heartbeat_at<now()-interval '3 minutes'")
            except Exception as error:
                print(json.dumps({'component': 'customer-voice-worker', 'errorType': type(error).__name__}), flush=True)
            time.sleep(3)


if __name__ == '__main__':
    main()
