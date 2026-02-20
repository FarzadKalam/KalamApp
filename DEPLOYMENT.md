# Deployment (GitHub Actions + Nginx)

This project is a Vite-built SPA. Production deployment is copying the built `dist/` output to the server.

## What You Get

- CI on every push/PR: install, typecheck, build
- CD on `main`: upload `dist/`, create a timestamped release, switch `current` symlink (atomic deploy), keep rollback history

## GitHub Secrets (Required)

In your GitHub repo: Settings -> Secrets and variables -> Actions -> Repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SERVER_HOST` (example: `212.23.201.161`)
- `SERVER_PORT` (example: `22`)
- `SERVER_USER` (example: `deploy`)
- `SERVER_SSH_KEY` (private key)
- `DEPLOY_PATH` (example: `/var/www/erp-mehrbanoo`)

## Server Setup (One-Time)

## SSH Keys (Windows -> Ubuntu)

You create an SSH key pair. The **public key** goes on the server, the **private key** goes into GitHub Secrets.

- Public key file: `erp_github_actions.pub` (single line starting with `ssh-ed25519 ...`)
- Private key file: `erp_github_actions` (multi-line, starts with `-----BEGIN OPENSSH PRIVATE KEY-----`)

On Windows (PowerShell) to print the public key:

```powershell
Get-Content -Raw .\erp_github_actions.pub
```

On Windows (CMD) to print the public key:

```bat
type erp_github_actions.pub
```

On Ubuntu, `Get-Content` does not exist; use `cat` only if the file is actually on the server.

### 1) Create deploy folder structure

Example:

```bash
sudo mkdir -p /var/www/erp-mehrbanoo/releases
sudo chown -R deploy:deploy /var/www/erp-mehrbanoo
```

### 1.5) First-time cutover (if you currently deploy directly into `/var/www/erp-mehrbanoo`)

If Nginx currently uses `root /var/www/erp-mehrbanoo;` and your files live directly in that folder, do one of these before switching Nginx root to `current`:

Option A (recommended): move current files into an initial release and create `current` symlink:

```bash
sudo mkdir -p /var/www/erp-mehrbanoo/releases/initial
sudo rsync -a --delete /var/www/erp-mehrbanoo/ /var/www/erp-mehrbanoo/releases/initial/ \
  --exclude releases --exclude shared --exclude current
sudo ln -sfn /var/www/erp-mehrbanoo/releases/initial /var/www/erp-mehrbanoo/current
```

Option B: run the GitHub deploy workflow once first (it will create `current`), then switch Nginx root.

### 2) Configure Nginx root to `current`

Change:

- `root /var/www/erp-mehrbanoo;`

To:

- `root /var/www/erp-mehrbanoo/current;`

Keep SPA routing:

```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 3) Allow HTTP access by IP (optional)

If you want `http://212.23.201.161` to open the app, add a separate port 80 server block for the IP:

```nginx
server {
  listen 80;
  server_name 212.23.201.161;
  root /var/www/erp-mehrbanoo/current;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

Notes:
- HTTPS on IP will show certificate mismatch (normal with Let's Encrypt).
- Your current certbot-managed port 80 block returns 404 for non-domain hosts; the extra IP block is the clean fix.

## Supabase URL on HTTPS sites

If your app is served over `https://...`, the browser will block `http://...` API calls (mixed-content). Ensure `VITE_SUPABASE_URL` is an `https://` URL in GitHub Secrets, typically by putting your Supabase API behind Nginx + Certbot on a subdomain (for example `https://api.erp.bartarleather.com`).

### 4) Let deploy user reload nginx without password (recommended)

Create `/etc/sudoers.d/deploy-nginx`:

```text
deploy ALL=NOPASSWD: /bin/systemctl reload nginx
```

## Rollback

On server:

```bash
ls -1 /var/www/erp-mehrbanoo/releases
sudo ln -sfn /var/www/erp-mehrbanoo/releases/<OLD_TIMESTAMP> /var/www/erp-mehrbanoo/current
sudo systemctl reload nginx
```
