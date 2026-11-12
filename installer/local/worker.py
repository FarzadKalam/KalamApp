#!/usr/bin/env python3
"""Persistent installation jobs. Run on the dedicated Iranian worker, not in an Edge Function."""
from __future__ import annotations
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import tarfile
import tempfile
import threading
import time
from common import InstallError, atomic_json, read_json, sha256, verify_release
from control_client import ControlClient


class Lease:
    def __init__(self, client, job):
        self.client, self.job = client, job
        self.stop = threading.Event()
        self.lost = threading.Event()
        self.thread = threading.Thread(target=self.keep, daemon=True)

    def keep(self):
        while not self.stop.wait(25):
            try: self.client.rpc("heartbeat", self.job["id"], self.job["lease_token"])
            except InstallError: self.lost.set(); return

    def __enter__(self):
        self.thread.start()
        return self

    def ensure(self):
        if self.lost.is_set(): raise InstallError("LEASE_LOST", "Job ownership was lost. Review existing output before retrying.")

    def stage(self, name, message):
        self.ensure()
        self.client.rpc("stage", self.job["id"], self.job["lease_token"], {"stage": name, "message": message})

    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(timeout=50)


def prepare(context, work, client, lease):
    install, release, job = context["installation"], context["release"], context["job"]
    lease.stage("verify_release", "نسخه و فایل‌های تأییدشده بررسی می‌شوند.")
    catalog = Path(os.environ["KALAMAPP_RELEASES_ROOT"]).resolve()
    # Only database-issued immutable IDs are used as filesystem components.
    import uuid
    version_dir = catalog / str(uuid.UUID(release["id"]))
    manifest = verify_release(version_dir, Path(os.environ["KALAMAPP_TRUST_KEY"]))
    if manifest["version"] != release["version"] or manifest["commit_sha"] != release["commit_sha"] or sha256(version_dir / "release.tar.gz") != release["checksum"]:
        raise InstallError("CENTRAL_RELEASE_MISMATCH", "The local release differs from the registered central release.")
    lease.stage("prepare_config", "تنظیمات غیرمحرمانهٔ این مشتری آماده می‌شوند.")
    config = {key: install[key] for key in ("system_code", "customer_name", "customer_org_id", "install_kind", "public_url", "access_mode", "tls_mode", "admin_name", "admin_email", "delivery_mode", "telemetry_enabled")}
    config['installation_id'] = install['id']
    atomic_json(work / "installation.json", config)
    guide = """KalamApp dedicated installation\n\n1. Download the common release archive and this configuration archive.\n2. Obtain the signing public key through the separately verified channel.\n3. Extract both archives into separate directories.\n4. Run: sudo bash release/installer/local/install.sh install --bundle ./release --trust-key /path/to/trusted-release.pub --config ./configuration/installation.json\n\nRead INSTALL_FA.md before transferring production data. No SSH credentials are stored by the control panel.\n"""
    (work / "START.txt").write_text(guide, encoding="utf-8")
    artifact = work / "configuration.tar.gz"
    with tarfile.open(artifact, "w:gz") as archive:
        for name in ("installation.json", "START.txt"):
            archive.add(work / name, arcname=name, recursive=False)
    lease.stage("upload", "بستهٔ تنظیمات در فضای خصوصی ثبت می‌شود.")
    object_path = f"{install['org_id']}/{install['id']}/{job['id']}/configuration.tar.gz"
    client.upload(artifact, object_path)
    lease.ensure()
    return {"artifact_path": object_path, "checksum": sha256(artifact), "version": release["version"], "shared_release_id": release["id"]}


def work_once(client, work_root):
    context = client.rpc("claim")
    if not context: return False
    job = context["job"]
    work = Path(tempfile.mkdtemp(prefix="job-", dir=work_root))
    os.chmod(work, 0o700)
    try:
        with Lease(client, job) as lease:
            if job["kind"] == "prepare": result = prepare(context, work, client, lease)
            else:
                from tenant_transfer import export_tenant
                result = export_tenant(context, work, client, lease)
            lease.ensure()
            client.rpc("succeed", job["id"], job["lease_token"], {"message": "فایل نهایی بررسی و ثبت شد.", "result": result})
    except InstallError as error:
        try: client.rpc("fail", job["id"], job["lease_token"], {"error_code": error.code, "message": "عملیات کامل نشد؛ کد خطا و راهنمای عیب‌یابی را بررسی کنید."})
        except InstallError: pass  # Expired leases become needs_review; never impersonate a new owner.
    except Exception:
        try: client.rpc("fail", job["id"], job["lease_token"], {"error_code": "WORKER_FAILED", "message": "اجرای عملیات ناموفق بود؛ گزارش worker را بررسی کنید."})
        except InstallError: pass
    finally:
        # The path comes from mkdtemp within the fixed worker directory, never from a customer request.
        if work.resolve().parent == work_root.resolve(): shutil.rmtree(work)
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()
    root = Path(os.environ.get("KALAMAPP_WORK_ROOT", "/var/lib/kalamapp-install-worker/jobs")).resolve()
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    client = ControlClient()
    last_purge = 0
    while True:
        try:
            if time.monotonic() - last_purge > 300:
                for artifact in client.rpc('expired_artifacts'):
                    if artifact.get('path'):
                        client.delete([artifact['path']])
                    client.rpc('artifact_purged', artifact['id'])
                last_purge = time.monotonic()
            found = work_once(client, root)
        except InstallError: found = False; print("CONTROL_API_UNAVAILABLE: retrying without exposing credentials.", flush=True)
        if args.once: break
        if not found: time.sleep(5)


if __name__ == "__main__": main()
