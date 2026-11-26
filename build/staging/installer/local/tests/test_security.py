"""Portable security tests. These do not certify an Ubuntu/Docker installation."""
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from common import InstallError, atomic_json, inside, sha256
from envelope import decrypt, encrypt
from maintenance import safe_extract
from secret_adapters import export_secrets, import_secrets
from tenant_transfer import export_query, selector, validate_inventory
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        cls.private = cls.key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        cls.public = cls.key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.root = Path(self.folder.name)

    def tearDown(self):
        self.folder.cleanup()

    def test_authenticated_envelope_round_trip_and_tampering(self):
        source = self.root / 'private.bin'
        source.write_bytes(os.urandom(2 * 1024**2 + 13))
        encrypted = self.root / 'snapshot.enc'
        encrypt(source, encrypted, self.public)
        restored = self.root / 'restored'
        decrypt(encrypted, restored, self.private)
        self.assertEqual(sha256(source), sha256(restored))
        damaged = bytearray(encrypted.read_bytes()); damaged[-18] ^= 1
        encrypted.write_bytes(damaged)
        target = self.root / 'untrusted'
        with self.assertRaisesRegex(InstallError, 'authentication tag'):
            decrypt(encrypted, target, self.private)
        self.assertFalse(target.exists(), 'Unauthenticated plaintext must be deleted')

    def test_wrong_customer_key_rejected_and_existing_files_never_deleted(self):
        source = self.root / 'source'; source.write_bytes(b'private customer rows')
        encrypted = self.root / 'encrypted'; encrypt(source, encrypted, self.public)
        other = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        private = other.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
        target = self.root / 'existing'; target.write_bytes(b'keep this backup')
        with self.assertRaises(InstallError): decrypt(encrypted, target, private)
        self.assertEqual(target.read_bytes(), b'keep this backup')
        with self.assertRaises(FileExistsError): encrypt(source, encrypted, self.public)
        decrypt(encrypted, self.root / 'verified', self.private)

    def test_paths_and_archive_links_are_rejected(self):
        for value in ('../outside', '/etc/passwd', 'C:/Windows/file', 'folder\\outside'):
            with self.assertRaises(InstallError): inside(self.root, value)
        for name, kind in (('../outside', tarfile.REGTYPE), ('link', tarfile.SYMTYPE)):
            archive = self.root / 'unsafe.tar'
            with tarfile.open(archive, 'w') as stream:
                member = tarfile.TarInfo(name); member.type = kind; member.linkname = '/etc/passwd'
                stream.addfile(member, io.BytesIO())
            with self.assertRaises(InstallError): safe_extract(archive, self.root / 'out')

    def test_duplicate_entries_and_expansion_budget_are_rejected(self):
        archive = self.root / 'duplicate.tar'
        with tarfile.open(archive, 'w') as stream:
            for _ in range(2):
                member = tarfile.TarInfo('a'); member.size = 1; stream.addfile(member, io.BytesIO(b'a'))
        with self.assertRaises(InstallError): safe_extract(archive, self.root / 'out')
        with tarfile.open(archive, 'w') as stream:
            member = tarfile.TarInfo('a'); member.size = 10; stream.addfile(member, io.BytesIO(b'a' * 10))
        with self.assertRaises(InstallError): safe_extract(archive, self.root / 'out', max_bytes=9)

    def test_customer_credentials_rekey_without_copying_source_key(self):
        key1, key2, iv = os.urandom(32), os.urandom(32), os.urandom(12)
        plaintext = b'{"password":"customer-owned-secret"}'
        encoded = 'v1.' + base64.b64encode(iv).decode() + '.' + base64.b64encode(AESGCM(key1).encrypt(iv, plaintext, None)).decode()
        rule = [{'column': 'encrypted_credentials', 'codec': 'aes_gcm_v1', 'key_env': 'TEST_CREDENTIAL_KEY'}]
        with patch.dict(os.environ, {'TEST_CREDENTIAL_KEY': base64.b64encode(key1).decode()}):
            exported = export_secrets({'encrypted_credentials': encoded}, rule)
        self.assertNotIn(base64.b64encode(key1).decode(), json.dumps(exported))
        local = import_secrets(exported, rule, {'TEST_CREDENTIAL_KEY': base64.b64encode(key2).decode()})
        _, nonce, ciphertext = local['encrypted_credentials'].split('.')
        self.assertEqual(AESGCM(key2).decrypt(base64.b64decode(nonce), base64.b64decode(ciphertext), None), plaintext)

    def test_scoped_memberships_password_hashes_and_indirect_rows(self):
        rules = {
            'public.user_organization_memberships': {'mode': 'org', 'columns': ['user_id', 'org_id']},
            'auth.users': {'mode': 'auth_users', 'columns': ['id', 'encrypted_password'], 'export_columns': ['id', 'encrypted_password']},
            'public.orders': {'mode': 'org', 'columns': ['id', 'org_id']},
            'public.order_items': {'mode': 'parent', 'parent': 'public.orders', 'foreign_key': 'order_id', 'columns': ['id', 'order_id']},
        }
        schema = [{'name': name, 'columns': rule['columns']} for name, rule in rules.items()]
        policy = {'format': 'kalamapp-tenant-policy-v1', 'tables': rules}
        validate_inventory(policy, schema)
        self.assertIn('encrypted_password', export_query('auth.users', rules['auth.users'], rules, 'customer-org'))
        self.assertIn('where org_id=', selector('auth.users', rules, 'customer-org'))
        self.assertIn('exists(select 1 from "public"."orders"', selector('public.order_items', rules, 'customer-org'))
        with self.assertRaises(InstallError): validate_inventory(policy, [*schema, {'name': 'public.unknown', 'columns': []}])
        rules['auth.sessions'] = {'mode': 'members', 'columns': ['id']}
        with self.assertRaises(InstallError): validate_inventory(policy, [*schema, {'name': 'auth.sessions', 'columns': ['id']}])

    def test_atomic_json_preserves_utf8(self):
        target = self.root / 'state.json'
        atomic_json(target, {'title': 'نصب اختصاصی'})
        self.assertEqual(json.loads(target.read_text(encoding='utf-8'))['title'], 'نصب اختصاصی')


if __name__ == '__main__': unittest.main()
