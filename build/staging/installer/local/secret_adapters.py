"""Explicit credential migrations; unknown encodings stop the transfer."""
import base64
import json
import os
import secrets
from common import InstallError

PREFIX = 'kalam-transfer-secret-v1:'


def export_secrets(row, rules):
    result = dict(row)
    for rule in rules:
        column = rule['column']; value = result.get(column)
        if value in (None, '', {}): continue
        if rule['codec'] == 'reconfigure':
            result[column] = None
            continue
        if rule['codec'] != 'aes_gcm_v1':
            raise InstallError('UNKNOWN_SECRET_CODEC', 'A customer credential has no supported migration adapter.')
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            version, iv, payload = value.split('.')
            if version != 'v1': raise ValueError()
            key = base64.b64decode(os.environ[rule['key_env']], validate=True)
            plaintext = AESGCM(key).decrypt(base64.b64decode(iv, validate=True), base64.b64decode(payload, validate=True), None)
            json.loads(plaintext)
            result[column] = PREFIX + base64.b64encode(plaintext).decode()
        except Exception:
            raise InstallError('CUSTOMER_SECRET_DECRYPT_FAILED', 'A selected customer credential could not be migrated. No central key was exported.') from None
    return result


def import_secrets(row, rules, local_keys):
    result = dict(row)
    for rule in rules:
        column = rule['column']; value = result.get(column)
        if value in (None, '', {}): continue
        if rule['codec'] != 'aes_gcm_v1' or not isinstance(value, str) or not value.startswith(PREFIX):
            raise InstallError('UNSUPPORTED_LOCAL_SECRET', 'A customer credential is not in the expected transfer format.')
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            key = base64.b64decode(local_keys[rule['key_env']], validate=True)
            iv = secrets.token_bytes(12)
            plaintext = base64.b64decode(value[len(PREFIX):], validate=True)
            result[column] = 'v1.' + base64.b64encode(iv).decode() + '.' + base64.b64encode(AESGCM(key).encrypt(iv, plaintext, None)).decode()
        except Exception:
            raise InstallError('CUSTOMER_SECRET_REKEY_FAILED', 'A customer credential could not be encrypted using the destination key.') from None
    return result
