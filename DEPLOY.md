# Putting GiftMe on your server

The setup: your code lives in a **private GitHub repo**. Every time you push, GitHub
builds a fresh Docker image automatically. Your server just runs that image, and
updating is one command, or fully automatic if you want.

```
your PC ──git push──▶ GitHub ──builds image──▶ ghcr.io ──docker compose pull──▶ your server
```

You need: a Linux server with Docker (and the `docker compose` plugin), and a domain or
subdomain pointing at it (e.g. `gifts.yourdomain.com`) if you want it reachable from
outside your home.

---

## 1. Put the code on GitHub (once)

1. On github.com, create a **new private repository** (e.g. `giftme`). Leave it empty:
   no README, no .gitignore.
2. In this project folder on your PC:

   ```bash
   git remote add origin https://github.com/YOUR-NAME/giftme.git
   git push -u origin main
   ```

3. Open the repo's **Actions** tab. The "Docker image" job builds the image (about 5
   minutes the first time, faster after). When it's green, the image is at
   `ghcr.io/your-name/giftme`. Your `.env` is never uploaded (it's in `.gitignore`).

## 2. Let your server download the image (once)

The image is private like the repo, so the server needs a token to read it.

1. On GitHub: **Settings → Developer settings → Personal access tokens → Tokens
   (classic) → Generate new token**. Tick only **`read:packages`**, no expiry (or a
   long one).
2. On the server:

   ```bash
   docker login ghcr.io -u YOUR-GITHUB-NAME
   # paste the token as the password
   ```

## 3. Start it on the server (once)

1. Make a folder and copy in the two files from `deploy/`, plus your `.env`. From your
   PC (replace `you@server`):

   ```bash
   ssh you@server "mkdir -p ~/giftme"
   scp deploy/docker-compose.yml deploy/update.sh .env you@server:~/giftme/
   ```

2. On the server, edit `~/giftme/docker-compose.yml`: replace `OWNER/REPO` with your
   GitHub name and repo, **in lowercase** (e.g. `ghcr.io/brandon/giftme:latest`).
3. Edit `~/giftme/.env`:
   - `APP_URL=https://gifts.yourdomain.com` (the address people will use; it's in every email link)
   - If a reverse proxy runs on the same machine (step 4), set `HOST_PORT=127.0.0.1:8090`
     so the app is only reachable through the proxy.
4. Start it:

   ```bash
   cd ~/giftme
   chmod +x update.sh
   docker compose up -d                         # or, with automatic updates:
   docker compose --profile autoupdate up -d
   ```

5. Check: `curl http://127.0.0.1:8090/api/health` should answer "API is healthy".

## 4. HTTPS (recommended)

Phones only offer "Install app" over https, and sign-in codes and passwords shouldn't
travel unencrypted. If you already run a reverse proxy (Nginx Proxy Manager, Traefik,
Caddy…), point `gifts.yourdomain.com` at `http://127.0.0.1:8090` (or the server's IP and
port) and turn on its free Let's Encrypt certificate.

No proxy yet? [Caddy](https://caddyserver.com/docs/install) is the simplest. Its whole
config (`/etc/caddy/Caddyfile`) is:

```
gifts.yourdomain.com {
    reverse_proxy 127.0.0.1:8090
}
```

It gets and renews the certificate by itself (ports 80 and 443 must reach the server).

Then in the GiftMe admin (`https://gifts.yourdomain.com/_/`) go to **Settings →
Application → Trusted proxy**, and add `X-Forwarded-For`. Without this, the rate limits
think every visitor is the proxy.

## 5. Bring over your current lists (optional)

Everything you made on your PC can move with it:

1. On your PC, open <http://localhost:8090/_/> → **Settings → Backups → New backup**,
   then download it.
2. On the server's admin → **Settings → Backups → Upload backup**, then **Restore**.
   The app restarts with all accounts, lists, gifts and pictures.

## 6. Email

Your mail provider (Brevo) only accepts mail from IP addresses you've allowed. Add the
**server's public IP** in Brevo under **SMTP & API → Authorized IPs** (or turn the
restriction off), or no emails will send: sign-in codes, reminders, digests.

---

## Updating

On your PC, commit your changes and `git push`. GitHub builds a new image (watch the
Actions tab). Then either:

- **Automatic**: if you started with `--profile autoupdate`, Watchtower picks up the
  new image within 30 minutes and restarts the app.
- **By hand**, on the server:

  ```bash
  cd ~/giftme && ./update.sh
  ```

Your data is in the `giftlist_data` Docker volume and survives updates. Database
changes in new versions are applied automatically when the app starts.

**Rolling back**: every build is also tagged with its commit, so you can pin a known-good
version by changing `:latest` in `docker-compose.yml` to `:<commit-sha>` (the long ID
shown on GitHub), then `docker compose up -d`.

## Backups

The app makes a backup every night at 3am and keeps 7, inside the same volume. Copy
them off the server now and then (or set S3 under **Settings → Backups**):

```bash
docker cp giftlist:/pb/pb_data/backups ./giftme-backups
```

## Alternative: build on the server instead

If you'd rather not use GitHub's image registry: clone the repo on the server (needs
git access to it), put your `.env` in the folder, and use the project's own
`docker-compose.yml`:

```bash
git clone https://github.com/YOUR-NAME/giftme.git ~/giftme && cd ~/giftme
cp /path/to/your/.env .
docker compose up -d --build
```

Update with `./update.sh` in that folder: it pulls the newest code and rebuilds (a few
minutes on a small server).
