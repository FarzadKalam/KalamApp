"""Streaming authenticated encryption for private tenant snapshots.

The recipient owns an RSA private key; the worker sees only its public key.
The worker additionally signs the encrypted envelope with the delegated release key.
"""
from __future__ import annotations
import base64
import json
import os
from pathlib import Path
import secrets
import struct
from common import InstallError

MAGIC = b"KALAMENC1"


def crypto():
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding, rsa
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        return hashes, serialization, padding, rsa, Cipher, algorithms, modes
    except ImportError:
        raise InstallError("OFFLINE_CRYPTO_MISSING", "Verified offline Python cryptography wheels are required for tenant transfer.") from None


def encrypt(source: Path, target: Path, recipient_pem: bytes):
    hashes, serialization, padding, rsa, Cipher, algorithms, modes = crypto()
    public_key = serialization.load_pem_public_key(recipient_pem)
    if not isinstance(public_key, rsa.RSAPublicKey) or public_key.key_size < 3072:
        raise InstallError("RECIPIENT_KEY_INVALID", "Use a customer-owned RSA public key of at least 3072 bits.")
    key, nonce = secrets.token_bytes(32), secrets.token_bytes(12)
    wrapped = public_key.encrypt(key, padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    header = json.dumps({"format": "kalamapp-encrypted-transfer-v1", "wrapped_key": base64.b64encode(wrapped).decode(), "nonce": base64.b64encode(nonce).decode()}, sort_keys=True, separators=(",", ":")).encode()
    encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
    encryptor.authenticate_additional_data(header)
    created = False
    try:
        with source.open("rb") as incoming, target.open("xb") as outgoing:
            created = True
            os.chmod(target, 0o600)
            outgoing.write(MAGIC + struct.pack("!I", len(header)) + header)
            for chunk in iter(lambda: incoming.read(1024 * 1024), b""):
                outgoing.write(encryptor.update(chunk))
            outgoing.write(encryptor.finalize())
            outgoing.write(encryptor.tag)
    except Exception:
        if created: target.unlink(missing_ok=True)
        raise


def decrypt(source: Path, target: Path, private_key_pem: bytes, password: bytes | None = None):
    hashes, serialization, padding, rsa, Cipher, algorithms, modes = crypto()
    created = False
    try:
        private_key = serialization.load_pem_private_key(private_key_pem, password=password)
        if not isinstance(private_key, rsa.RSAPrivateKey): raise ValueError()
        with source.open("rb") as incoming:
            if incoming.read(len(MAGIC)) != MAGIC: raise ValueError()
            header_size = struct.unpack("!I", incoming.read(4))[0]
            if not 1 < header_size < 8192: raise ValueError()
            header = incoming.read(header_size)
            metadata = json.loads(header)
            if metadata["format"] != "kalamapp-encrypted-transfer-v1": raise ValueError()
            key = private_key.decrypt(base64.b64decode(metadata["wrapped_key"], validate=True), padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
            nonce = base64.b64decode(metadata["nonce"], validate=True)
            data_start = incoming.tell()
            incoming.seek(-16, 2); tag = incoming.read(16)
            ciphertext_size = source.stat().st_size - data_start - 16
            if ciphertext_size < 0: raise ValueError()
            incoming.seek(data_start)
            decryptor = Cipher(algorithms.AES(key), modes.GCM(nonce, tag)).decryptor()
            decryptor.authenticate_additional_data(header)
            with target.open("xb") as outgoing:
                created = True
                os.chmod(target, 0o600)
                while ciphertext_size:
                    chunk = incoming.read(min(ciphertext_size, 1024 * 1024))
                    if not chunk: raise ValueError()
                    ciphertext_size -= len(chunk)
                    outgoing.write(decryptor.update(chunk))
                outgoing.write(decryptor.finalize())
    except Exception:
        if created: target.unlink(missing_ok=True)
        raise InstallError("TRANSFER_DECRYPT_FAILED", "The snapshot key, authentication tag or file is invalid.", "Use the matching customer recovery key and an unmodified signed snapshot.") from None
