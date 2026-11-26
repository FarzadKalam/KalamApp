"""Publish only after a real deployed central provenance file matches this signed release."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import shutil
import tempfile
import urllib.request
import uuid
from common import InstallError, sha256, verify_release
from control_client import ControlClient


def publish(stage, archive, trust, central_url, org_id):
    manifest = verify_release(stage, trust)
    # The uploaded archive must be the very same signed and tested release.
    from maintenance import safe_extract
    with tempfile.TemporaryDirectory(prefix='verify-publish-') as temporary:
        extracted = Path(temporary)
        safe_extract(archive, extracted)
        archived = verify_release(extracted, trust)
        if archived != manifest or sha256(extracted / 'manifest.json') != sha256(stage / 'manifest.json'):
            raise InstallError('ARCHIVE_RELEASE_MISMATCH', 'The archive differs from the staged release.')
    if not central_url.startswith('https://'): raise InstallError('CENTRAL_HTTPS_REQUIRED', 'Use the verified central HTTPS origin.')
    with urllib.request.urlopen(central_url.rstrip('/') + '/central-release.json', timeout=30) as response:
        central = json.load(response)
    if central.get('format') != 'kalamapp-central-release-v1' or central.get('dirty') is not False or central.get('version') != manifest['version'] or central.get('commit_sha') != manifest['commit_sha']:
        raise InstallError('CENTRAL_VERSION_MISMATCH', 'The signed bundle does not match the currently deployed clean central release.')
    if central.get('dependency_checksum') != manifest.get('dependency_checksum') or central.get('schema_inventory') != manifest.get('schema_inventory'):
        raise InstallError('CENTRAL_INPUT_MISMATCH', 'Dependencies or database source inventory differ from the central release.')
    release_id = str(uuid.uuid4()); org_id = str(uuid.UUID(org_id))
    destination = Path(os.environ['KALAMAPP_RELEASES_ROOT']) / release_id
    shutil.copytree(stage, destination)
    shutil.copyfile(archive, destination / 'release.tar.gz')
    client = ControlClient()
    path = f'{org_id}/releases/{release_id}/release.tar.gz'
    client.upload(archive, path)
    try:
        client.rpc('publish', payload={'id': release_id, 'org_id': org_id, 'version': manifest['version'], 'commit_sha': manifest['commit_sha'],
            'schema_version': manifest['schema_version'], 'manifest': manifest, 'artifact_path': path, 'signature_path': 'manifest.sig', 'checksum': sha256(archive)})
    except Exception:
        client.delete([path])
        raise
    print('Verified local release registered for the deployed central version.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('stage', 'archive', 'trust-key'): parser.add_argument('--' + name, required=True, type=Path)
    parser.add_argument('--central-url', required=True); parser.add_argument('--provider-org', required=True)
    args = parser.parse_args()
    try: publish(args.stage, args.archive, args.trust_key, args.central_url, args.provider_org)
    except InstallError as e: parser.exit(1, e.code + ': ' + e.message + '\n')
