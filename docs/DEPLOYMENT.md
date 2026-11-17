# Deployment

This project is a Vite-built SPA. Production deployment is copying the built `dist/` output to the server.

## Quick Start

If you want deploy without GitHub, do only these steps:

1. Create `.env.deploy` from `.env.deploy.example`
2. Fill these 4 values:
   - `DEPLOY_HOST`
   - `DEPLOY_PORT`
   - `DEPLOY_USER`
   - `DEPLOY_PATH`
3. Make sure your app envs like `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are already in `.env.local`
4. The `build` script already runs Vite with a larger Node heap to avoid local out-of-memory failures on bigger bundles.
5. Run:

```powershell
npm run deploy:prod
```

That is all. You do not need GitHub, GitHub Actions, or GitHub Secrets for this local deploy flow.

## Pre-Deploy Checklist

Before every production deploy, run this checklist for the current release:

1. Fetch `origin/main`; confirm the release is being built from the latest `main` commit. The GitHub Actions production job enforces this and refuses stale commits or feature branches.
2. Confirm `package.json` version and `.version-changes.json` entry are in sync.
3. Run the project tests and `npx tsc --noEmit`; make sure both succeed.
4. Verify `dist/sw.js` has the stamped cache version of the current release (and no raw version token), and `dist/version.json` reports that same version. After deploy, verify that the actual PWA host serves `sw.js`, `index.html`, and `version.json` with `Cache-Control: no-cache, no-store, must-revalidate`.
5. Make sure each explicitly listed database migration required by the release has already been applied or is included in the approved deployment.
6. Smoke-test the critical paths after the final build:
   - Dashboard open
   - One heavy module list
   - One process-enabled module show page
   - Public site routes such as `/blog`, `/learn`, `/updates`
7. If the release contains runtime/performance changes, verify that no obvious `select('*')`, per-row process fetch, or full relation scan remains on the main user flow.

## Local Deploy Without GitHub

If GitHub Actions is blocked, you can deploy directly from your Windows machine to the server.

1. Copy `.env.deploy.example` to `.env.deploy`
2. Fill `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_PATH`
3. Keep your build-time frontend envs such as `VITE_SUPABASE_URL` in `.env.local`
4. Run:

```powershell
npm run deploy:prod
```

What it does:
- runs the local build
- packs `dist/`
- uploads it with `scp`
- creates a timestamped release on the server
- points `current` to the new release
- reloads `nginx` if the deploy user is allowed to do it

For a one-click flow in VS Code, run the `Deploy KalamApp` task.

## Supabase Edge Functions Deploy

For self-hosted Supabase Edge Functions, use the separate deploy script:

```powershell
npm run deploy:function -- -Function taxpayer_system
```

Useful variants:

```powershell
npm run deploy:function:list
npm run deploy:function -- -Function send-sms,bot-webhook
npm run deploy:function:all
```

Required settings in `.env.deploy`:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_FUNCTIONS_PATH`

Optional settings:

- `DEPLOY_SSH_KEY_PATH`
- `DEPLOY_FUNCTIONS_COMPOSE_DIR`
- `DEPLOY_FUNCTIONS_COMPOSE_FILE`
- `DEPLOY_FUNCTIONS_SERVICE`
- `DEPLOY_FUNCTIONS_FILES_WITH_SUDO`
- `DEPLOY_FUNCTIONS_RESTART_WITH_SUDO`
- `DEPLOY_FUNCTIONS_ARCHIVE_NAME`

The script copies only the selected function folder(s) into the remote `volumes/functions` path and then recreates the `functions` service unless `-SkipRestart` is used.

If the `deploy` user cannot write into the remote `volumes/functions` directory, set:

```env
DEPLOY_FUNCTIONS_FILES_WITH_SUDO=true
```

If the compose `.env` file or the `docker compose` command is also restricted, set:

```env
DEPLOY_FUNCTIONS_RESTART_WITH_SUDO=true
```

When either sudo flag is enabled, the deploy script allocates a TTY so you can enter the sudo password interactively. If you prefer not to use sudo, change ownership of the target directory and compose files so the deploy user can read and write them directly.
## GitHub Actions Flow

CI runs on pushes and pull requests to `main`. Production deployment is separate and manual: dispatch the `CI-CD` workflow from the latest `main` commit and set `deploy=true`. The workflow rejects feature branches and stale commits before it changes production. It applies only the explicitly listed database migrations and Edge Functions; it does not publish tenant site pages or product content. Those remain manual actions inside the app.

## What You Get

- CI on pushes and pull requests: install, typecheck, database and application tests, and build
- Production release: only after a manual workflow dispatch from the latest `main`; the release uploads `dist/`, applies the listed migrations/functions, creates a timestamped release, and switches the `current` symlink
- The server retains the last five frontend releases for code rollback. A code rollback does not automatically undo database migrations or restore changed records; database recovery requires a separate, compatible rollback or backup-restoration plan.

## GitHub Secrets (Required Only For GitHub Actions)

In your GitHub repo: Settings -> Secrets and variables -> Actions -> Repository secrets:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SERVER_HOST` (example: `212.23.201.161`)
- `SERVER_PORT` (example: `22`)
- `SERVER_USER` (example: `deploy`)
- `SERVER_SSH_KEY` (private key)
- `DEPLOY_PATH` (example: `/var/www/kalamapp`)

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
sudo mkdir -p /var/www/kalamapp/releases
sudo chown -R deploy:deploy /var/www/kalamapp
```

### 1.5) First-time cutover (if you currently deploy directly into `/var/www/kalamapp`)

If Nginx currently uses `root /var/www/kalamapp;` and your files live directly in that folder, do one of these before switching Nginx root to `current`:

Option A (recommended): move current files into an initial release and create `current` symlink:

```bash
sudo mkdir -p /var/www/kalamapp/releases/initial
sudo rsync -a --delete /var/www/kalamapp/ /var/www/kalamapp/releases/initial/ \
  --exclude releases --exclude shared --exclude current
sudo ln -sfn /var/www/kalamapp/releases/initial /var/www/kalamapp/current
```

Option B: run the GitHub deploy workflow once first (it will create `current`), then switch Nginx root.

### 2) Configure Nginx root to `current`

Change:

- `root /var/www/kalamapp;`

To:

- `root /var/www/kalamapp/current;`

Keep SPA routing:

```nginx
location = /index.html {
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  try_files $uri =404;
}

location = /version.json {
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  try_files $uri =404;
}

location = /sw.js {
  add_header Cache-Control "no-cache, no-store, must-revalidate" always;
  try_files $uri =404;
}

# Install ops/nginx/assets-module-routes.conf at this path first.
# It preserves direct links and reloads for the Assets module.
include /etc/nginx/snippets/kalamapp-assets-routes.conf;

location /assets/ {
  add_header Cache-Control "public, max-age=31536000, immutable" always;
  try_files $uri =404;
}

location / {
  try_files $uri $uri/ /index.html;
}
```

Reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

The Assets module uses `/assets`, `/assets/create`, `/assets/:id` and
`/assets/:id/edit`. Without the included routes, Nginx treats these as the
static bundle directory and returns a redirect or 404. Keep the snippet in
every application server block, including tenant hosts. Requests for bundled
files under `/assets/` retain immutable caching and missing files return 404.

### 3) Allow HTTP access by IP (optional)

If you want `http://212.23.201.161` to open the app, add a separate port 80 server block for the IP:

```nginx
server {
  listen 80;
  server_name 212.23.201.161;
  root /var/www/kalamapp/current;
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

If your app is served over `https://...`, the browser will block `http://...` API calls (mixed-content). Ensure `VITE_SUPABASE_URL` is an `https://` URL in GitHub Secrets, typically by putting your Supabase API behind Nginx + Certbot on a subdomain (for example `https://api.your-erp-domain.com`).

### 4) Let deploy user reload nginx without password (recommended)

Create `/etc/sudoers.d/deploy-nginx`:

```text
deploy ALL=NOPASSWD: /bin/systemctl reload nginx
```

## Rollback

On server:

```bash
ls -1 /var/www/kalamapp/releases
sudo ln -sfn /var/www/kalamapp/releases/<OLD_TIMESTAMP> /var/www/kalamapp/current
sudo systemctl reload nginx
```
