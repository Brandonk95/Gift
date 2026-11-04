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
   git remote add origin https://github.com/Brandonk95/Gift.git
   git push -u origin main
   ```

3. Open the repo's **Actions** tab. The "Docker image" job builds the image (about 5
   minutes the first time, faster after). When it's green, the image is at
   `ghcr.io/brandonk95/gift`. Your `.env` is never uploaded (it's in `.gitignore`).

## 2. Let your server download the image (once)

The simplest option: make the **image** public (your code stays private). On GitHub, go to
your profile → **Packages** → `gift` → **Package settings** → **Change visibility** →
Public. Then nothing needs a login.

To keep it private instead, create a token: **Settings → Developer settings → Personal
access tokens → Tokens (classic)**, tick only **`read:packages`**. Then:
- on the server, run `sudo docker login ghcr.io -u Brandonk95` and paste the token as
  the password, and
- in the compose file, put your GitHub name and the token in watchtower's `REPO_USER` and
  `REPO_PASS` so automatic updates can download it too.

## 3. Start it on the server (once)

[`deploy/docker-compose.yml`](deploy/docker-compose.yml) is self-contained: no `.env`
file, no other files. Its settings are written straight into it, and the ones to fill
in are marked `← set this`: `APP_URL`, your admin email and password, and your mail
server. Your data goes in `/DATA/AppData/giftlist` on the server.

Email links use whichever address the person who caused the email was using. If you
reach the app through more than one domain, list them all in `APP_URL`, separated by
commas, default first. Home-network and Tailscale addresses (like
`http://192.168.1.20:8090` or `http://100.117.26.20:8090`) work without being listed.

- **CasaOS**: App Store → **Custom Install** → import icon (top right) → paste the file
  → fill in the settings on the giftlist tab → **Install**.
- **Portainer / Dockge**: create a new stack, paste the file, edit the marked lines,
  deploy.
- **Plain Docker**: copy the file to a folder on the server, edit the marked lines, then:

  ```bash
  docker compose up -d
  ```

Check it: open `http://<server-ip>:8090`. If you left the admin email and password empty,
the container log (`docker logs giftlist`) prints a one-time link for creating the admin
account.

The compose file also runs **Watchtower**, which installs new versions automatically
(see Updating). Running a reverse proxy on the same machine (step 4)? Change the port line
to `"127.0.0.1:8090:8090"` so the app is only reachable through the proxy.

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

- **Automatic** (the default): Watchtower picks up the new image within 30 minutes and
  restarts the app.
- **Right now**, on the server, in the folder with the compose file (or press the
  update/recreate button in CasaOS or Portainer):

  ```bash
  docker compose pull && docker compose up -d
  ```

Your data is in `/DATA/AppData/giftlist` and survives updates. Database
changes in new versions are applied automatically when the app starts.

**Rolling back**: every build is also tagged with its commit, so you can pin a known-good
version by changing `:latest` in `docker-compose.yml` to `:<commit-sha>` (the long ID
shown on GitHub), then `docker compose up -d`.

## Backups

The app makes a backup every night at 3am and keeps 7, inside the same volume. Copy
them off the server now and then (or set S3 under **Settings → Backups**):

```bash
cp -r /DATA/AppData/giftlist/pb_data/backups ./giftme-backups
```

## Alternative: build on the server instead

If you'd rather not use GitHub's image registry: clone the repo on the server (needs
git access to it), put your `.env` in the folder, and use the project's own
`docker-compose.yml`:

```bash
git clone https://github.com/Brandonk95/Gift.git ~/giftme && cd ~/giftme
cp /path/to/your/.env .
docker compose up -d --build
```

Update with `./update.sh` in that folder: it pulls the newest code and rebuilds (a few
minutes on a small server).
