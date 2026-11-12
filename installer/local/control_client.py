"""Worker-side HTTP client. Credentials are read from a private environment file by systemd."""
from __future__ import annotations
import http.client
import json
import os
from pathlib import Path
import ssl
import urllib.parse
import urllib.request
from common import InstallError


class ControlClient:
    def __init__(self):
        self.url = os.environ["SUPABASE_URL"].rstrip("/")
        self.key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        parsed = urllib.parse.urlsplit(self.url)
        if parsed.scheme != "https" and parsed.hostname not in ("localhost", "127.0.0.1"):
            raise InstallError("INSECURE_CONTROL_URL", "The control API must use HTTPS.")

    def request(self, path, payload=None, method="POST"):
        request = urllib.request.Request(self.url + path, method=method,
            data=json.dumps(payload).encode() if payload is not None else None,
            headers={"Content-Type": "application/json", "apikey": self.key, "Authorization": "Bearer " + self.key})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except Exception:
            raise InstallError("CONTROL_API_FAILED", "The control API request failed.", "Check worker connectivity and scoped job status; do not share credentials.") from None

    def rpc(self, action, job_id=None, lease=None, payload=None):
        return self.request("/rest/v1/rpc/worker_local_installation", {"p_action": action, "p_id": job_id, "p_lease": lease, "p_payload": payload or {}})

    def upload(self, source: Path, object_path: str):
        parsed = urllib.parse.urlsplit(self.url)
        connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
        connection = connection_type(parsed.hostname, parsed.port, timeout=120)
        path = parsed.path.rstrip("/") + "/storage/v1/object/local-installations-private/" + urllib.parse.quote(object_path, safe="/")
        try:
            connection.putrequest("POST", path)
            for name, value in {"Authorization": "Bearer " + self.key, "apikey": self.key, "Content-Type": "application/octet-stream", "Content-Length": str(source.stat().st_size), "x-upsert": "false"}.items():
                connection.putheader(name, value)
            connection.endheaders()
            with source.open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    connection.send(chunk)
            response = connection.getresponse()
            response.read(65536)
            if response.status not in (200, 201): raise InstallError("ARTIFACT_UPLOAD_FAILED", "Artifact upload failed; no success was recorded.")
        finally: connection.close()

    def delete(self, paths):
        return self.request("/storage/v1/object/local-installations-private", {"prefixes": paths}, "DELETE")

    def download_storage(self, bucket, name, target):
        path = "/storage/v1/object/authenticated/" + urllib.parse.quote(bucket, safe="") + "/" + urllib.parse.quote(name, safe="/")
        request = urllib.request.Request(self.url + path, headers={"apikey": self.key, "Authorization": "Bearer " + self.key})
        try:
            with urllib.request.urlopen(request, timeout=120) as response, target.open("xb") as stream:
                os.chmod(target, 0o600)
                while chunk := response.read(1024 * 1024): stream.write(chunk)
        except Exception:
            target.unlink(missing_ok=True)
            raise InstallError("STORAGE_EXPORT_FAILED", "A selected tenant file could not be copied.") from None
