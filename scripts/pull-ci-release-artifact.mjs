// Download the exact CI archive on the server; never send the GitHub token there.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const token = required('GH_TOKEN');
const repository = required('GITHUB_REPOSITORY');
const runId = required('GITHUB_RUN_ID');
const revision = required('GITHUB_SHA');
if (!/^[a-f0-9]{40}$/i.test(revision)) throw new Error('Invalid release revision');
const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };
const list = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}/artifacts`, {
  headers, signal: AbortSignal.timeout(30000),
});
if (!list.ok) throw new Error(`Artifact listing failed: HTTP ${list.status}`);
const artifact = (await list.json()).artifacts.find((item) => item.name === `release-bundle-${revision}` && !item.expired);
if (!artifact) throw new Error('The exact release bundle was not found');
const redirect = await fetch(artifact.archive_download_url, {
  headers, redirect: 'manual', signal: AbortSignal.timeout(30000),
});
const location = redirect.headers.get('location');
if (redirect.status !== 302 || !location?.startsWith('https://')) throw new Error('Private artifact download location was not returned');
console.log(`::add-mask::${location}`);
const digest = createHash('sha256').update(readFileSync('dist.tar.gz')).digest('hex');
const config = Buffer.from(JSON.stringify({ url: location, digest, revision })).toString('base64');
// All inputs travel over SSH stdin, including the short-lived signed URL.
const script = `set -euo pipefail
python3 - '${config}' <<'PY'
import base64, concurrent.futures, hashlib, json, os, shutil, sys, tempfile, time, urllib.request, zipfile
cfg = json.loads(base64.b64decode(sys.argv[1]))
url = cfg['url']
archive = '/tmp/kalamapp-dist-' + cfg['revision'] + '.tar.gz'
work = tempfile.mkdtemp(prefix='kalamapp-pull-' + cfg['revision'][:12] + '-')
try:
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=40) as response:
        size = int(response.headers['Content-Length'])
    if size <= 0 or size > 512 * 1024 * 1024:
        raise ValueError('Unexpected artifact size')
    chunk_size = 1024 * 1024
    ranges = [(start, min(size - 1, start + chunk_size - 1)) for start in range(0, size, chunk_size)]
    def download(item):
        index, (start, end) = item
        path = os.path.join(work, str(index))
        for attempt in range(3):
            try:
                request = urllib.request.Request(url, headers={'Range': 'bytes=%d-%d' % (start, end)})
                with urllib.request.urlopen(request, timeout=150) as response:
                    expected = 'bytes %d-%d/%d' % (start, end, size)
                    if response.status != 206 or response.headers.get('Content-Range') != expected:
                        raise ValueError('Invalid artifact range')
                    with open(path, 'wb') as output:
                        shutil.copyfileobj(response, output, 65536)
                if os.path.getsize(path) != end - start + 1:
                    raise ValueError('Incomplete artifact range')
                return path
            except Exception:
                if attempt == 2:
                    raise RuntimeError('Artifact range download failed') from None
                time.sleep(2)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        parts = list(pool.map(download, enumerate(ranges)))
    zip_path = os.path.join(work, 'bundle.zip')
    with open(zip_path, 'wb') as output:
        for part in parts:
            with open(part, 'rb') as source:
                shutil.copyfileobj(source, output)
    tar_path = os.path.join(work, 'dist.tar.gz')
    with zipfile.ZipFile(zip_path) as bundle:
        entry = bundle.getinfo('dist.tar.gz')
        if entry.file_size > 512 * 1024 * 1024:
            raise ValueError('Unexpected release archive size')
        with bundle.open(entry) as source, open(tar_path, 'wb') as output:
            shutil.copyfileobj(source, output)
    digest = hashlib.sha256()
    with open(tar_path, 'rb') as source:
        for block in iter(lambda: source.read(1024 * 1024), b''):
            digest.update(block)
    if digest.hexdigest() != cfg['digest']:
        raise ValueError('CI archive checksum mismatch')
    os.replace(tar_path, archive)
    print('Exact CI release archive downloaded and SHA-256 verified')
except Exception as error:
    print('Artifact pull failed: ' + type(error).__name__, file=sys.stderr)
    sys.exit(1)
finally:
    shutil.rmtree(work)
PY
`;
const port = process.env.SERVER_PORT || '22';
if (!/^\d+$/.test(port)) throw new Error('Invalid SSH port');
const result = spawnSync('ssh', [
  '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
  '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=2',
  '-p', port, `${required('SERVER_USER')}@${required('SERVER_HOST')}`, 'bash', '-s',
], { input: script, encoding: 'utf8', timeout: 600000, maxBuffer: 1024 * 1024 });
if (result.stdout) process.stdout.write(result.stdout);
if (result.status !== 0) throw new Error('Server artifact pull failed; use the resumable SSH transfer fallback');
