#!/usr/bin/env python3
"""Trusted entry point. Obtain this file AND the release public key independently.

Never run code from an archive to verify that archive. This entry point uses only
Python's standard library and the operating system's OpenSSL until verification.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import sys
import tarfile
import tempfile


def unpack_verified(archive, public_key, destination):
    destination = destination.resolve()
    if not public_key.is_file() or public_key.resolve().is_relative_to(destination):
        raise ValueError('A separately trusted release public key is required.')
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    if any(destination.iterdir()):
        raise ValueError('The extraction destination must be empty.')
    with tarfile.open(archive, 'r:*') as source:
        members = {}
        total = 0
        for member in source:
            name = PurePosixPath(member.name)
            if (not member.isfile() or member.name in members or name.is_absolute()
                or '..' in name.parts or '\\' in member.name or ':' in member.name
                or str(name) != member.name or member.size < 0):
                raise ValueError('The archive contains unsafe paths or duplicate entries.')
            total += member.size
            if len(members) >= 100000 or total > 256 * 1024**3:
                raise ValueError('The archive exceeds the supported extraction limits.')
            members[member.name] = member
        if not {'manifest.json', 'manifest.sig'}.issubset(members):
            raise ValueError('The archive has no release signature.')
        if members['manifest.json'].size > 16 * 1024**2 or members['manifest.sig'].size > 4096:
            raise ValueError('The release manifest or signature is too large.')
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)
            for name in ('manifest.json', 'manifest.sig'):
                (folder / name).write_bytes(source.extractfile(members[name]).read())
            verified = subprocess.run(['openssl', 'pkeyutl', '-verify', '-pubin', '-rawin',
                '-inkey', str(public_key), '-sigfile', str(folder / 'manifest.sig'),
                '-in', str(folder / 'manifest.json')], capture_output=True, timeout=30)
            if verified.returncode:
                raise ValueError('The release signature is invalid. No package code was executed.')
            manifest = json.loads((folder / 'manifest.json').read_text(encoding='utf-8'))
        files = manifest.get('files')
        if manifest.get('format') != 'kalamapp-release-v1' or not isinstance(files, dict):
            raise ValueError('The signed release format is unsupported.')
        if set(members) != set(files) | {'manifest.json', 'manifest.sig'}:
            raise ValueError('The archive contents differ from the signed file inventory.')
        if shutil.disk_usage(destination).free < total + 1024**3:
            raise ValueError('There is not enough disk space to verify and extract this archive.')
        for name, member in members.items():
            target = destination.joinpath(*PurePosixPath(name).parts)
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            digest = hashlib.sha256()
            with source.extractfile(member) as incoming, target.open('xb') as outgoing:
                os.chmod(target, 0o600)
                while chunk := incoming.read(1024 * 1024):
                    digest.update(chunk)
                    outgoing.write(chunk)
            if name in files and digest.hexdigest() != files[name]:
                raise ValueError('A package file is damaged. No package code was executed.')
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--trust-key', type=Path, required=True)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path('/opt/kalamapp'))
    args = parser.parse_args()
    try:
        if os.name != 'posix' or os.geteuid() != 0:
            raise ValueError('Run this trusted entry point with sudo on the Ubuntu server.')
        os.umask(0o077)
        with tempfile.TemporaryDirectory(prefix='kalamapp-verified-') as temporary:
            folder = Path(temporary)
            print('[0/7] Verify the release before running its installer', flush=True)
            unpack_verified(args.archive, args.trust_key, folder)
            result = subprocess.run([sys.executable, str(folder / 'installer/local/cli.py'), 'install',
                '--bundle', str(folder), '--trust-key', str(args.trust_key.resolve()),
                '--config', str(args.config.resolve()), '--root', str(args.root.resolve())])
            return result.returncode
    except (OSError, ValueError, tarfile.TarError, subprocess.SubprocessError):
        print('VERIFY_FAILED: Check the trusted key, archive checksum, free space and installation guide.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
