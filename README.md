# 🎁 Gift List

A self-hosted wish list app for Christmas, birthdays, weddings, baby showers and more.
Anyone can sign up and build lists, share them with a private link, and friends reserve
gifts so nobody buys duplicates. **The list owner never sees what's been reserved**, so
the surprise is kept.

- **Backend:** [PocketBase](https://pocketbase.io) v0.40 (auth, database, file storage, SMTP, JS hooks)
- **Frontend:** React + Vite single page app, served by PocketBase
- **Deployment:** one Docker container, data stored in a volume

## Features

- Email/password accounts, email verification, password reset and email change (over SMTP),
  with in-app pages for every email link
- Designed HTML emails (with plain-text versions) for verification, password reset, list
  invitations and reservation reminders, each with a "check your spam folder" hint
- Multiple lists per user, each with an occasion, date (with countdown) and note
- Item editor: name, link, price, quantity, priority, category, details, and a picture
  (upload a file or use an image URL)
- **✨ Autofill**: paste a product link (or text shared from a store app) and the server
  reads the name, price, currency, pictures and description from the page: schema.org
  product data, Open Graph and product meta tags, microdata, and Amazon/Walmart page data.
  Choose between the pictures it finds, and tracking junk is stripped from the link.
  Stores that block previews still get a name guessed from the link. Small shops on
  **Shopify** are read from Shopify's own product data, so the price, option, brand and
  photos are exact. When a price may be wrong (it differs by size or color, or it was only
  found in the page's code), the editor says "Check the price".
- **Photo search** (optional): when a store gives no usable picture (Amazon, blocked sites),
  the editor searches the web for photos of the gift and lets you pick one. There's also a
  "Find photos online" button. Needs a free [Brave Search API](https://brave.com/search/api) key.
- Categories: 10 built-in ones plus your own custom categories (with emoji)
- Search, filter by category, and sort by your own order (drag to reorder), priority, price, name or newest
- Quick-add bar: type a gift name and press Enter, or paste a link to autofill it
- Card, compact, list and **board** layouts (board shows whole pictures in staggered
  columns, still in your order). Owners can pick the layout friends see first.
- **List banners**: a themed banner (Winter, Party, Little one, Love, Garden, Starry
  night) or your own photo across the top of the list, also shown on dashboard cards
- **Private ideas boards**: lists only you can see, with no working share link, for gifts
  you're still deciding on. Move ideas to a real list when you're sure.
- **Getting started guide** on the dashboard for new accounts (make a list, add a gift,
  share it), which disappears when done or dismissed
- Star gifts as "most wanted"; add size and color/variant details
- Mark gifts as **received** (hidden from friends); move or copy gifts between lists;
  duplicate whole lists (e.g. reuse last year's); archive old lists
- Per-list settings: icon, color tag, currency, hide prices from friends, hide who reserved
- **Shopping list** for givers: everything you've reserved across friends' lists, with
  "bought" checkboxes, progress and totals, and CSV export
- Export a list to CSV or print it
- **Appearance settings** saved to your account: light/dark/system theme, accent color,
  font, corner style and default layout
- Profile picture (or your Gravatar, if you haven't uploaded one), password change and self-service account deletion
- Share with a private link (copy, text, WhatsApp, native share sheet), a downloadable
  **QR code** for printed invitations, or **email invitations** straight from the app. Reset the link at any time to revoke access.
- Friends can view without an account, and **reserve or chip in without one too**: they
  give their name and email, and confirm with a 6-digit code we email them (no password,
  no app). Under the hood that's a light "guest" account, which they can turn into a normal
  one by setting a password under Account. People with an account can log in as usual.
  Everyone gets a confirmation email when they reserve something. (Without email set up,
  friends need an account with a password to reserve.)
- **Reservations last a week** (`RESERVATION_DAYS`). The person who reserved a gift can
  renew it from the list or their shopping list, and gets a reminder email a day before it
  runs out. Expired reservations are released (checked every 15 minutes) so someone else
  can get the gift, and the person is emailed that it ended. Gifts marked as bought don't
  expire.
- **Chip in together**: for pricier gifts, friends can split the cost instead of one
  person reserving it. Everyone sees how much has been pledged towards the price; the
  owner sees nothing. A gift can be reserved or shared, not both.
- **Anonymous questions**: friends can ask the owner about a size, color or the whole
  list without saying who they are. The owner gets an email, answers from their list, and
  the answer shows for everyone (the asker gets an email too).
- **Who gave what**: owners can turn on "show me who gave what" for a list. Friends are
  told on the list, and the day after the list's date the owner sees who reserved or
  chipped in on each gift, with a checklist for thank-you notes.
- **Price drops**: gifts with a link and price are re-checked about once a week. When the
  store's price falls (3% or more), the new price shows on the gift and whoever reserved
  or chipped in gets an email. Stores that block previews are skipped.
- Lists shared with you show up on your dashboard
- **Follow a friend's list** to get one email each night (midnight in `TZ`) with every
  gift they added that day, so adding ten gifts doesn't send ten emails. Only new gifts
  are included, and resetting the share link stops the emails. Followers also get a
  reminder a week before the list's date, with how many gifts are still open.
- **Coming up** on the dashboard: your own lists, friends' lists you've opened and
  Secret Santa exchanges happening in the next 60 days, soonest first.
- **Email settings**: every optional email (reservations, reminders, follow digests,
  occasion reminders, questions, price drops, Secret Santa) can be turned off under
  Account → Emails, or with the one-click unsubscribe link in each email (mail apps that
  support `List-Unsubscribe` show their own button). Account emails like password resets
  always send.
- **🎅 Secret Santa**: create a gift exchange with a date, budget and note, invite people
  by link or email, and everyone picks the wish list their Santa should see. Set "can't
  draw" rules for partners, then draw names: each person gets an email with who they're
  buying for and a link to that wish list. Nobody, not even the organizer, sees anyone
  else's match. Santas get an email when their person shares a list after the draw, and
  the organizer can draw again if someone joins late. After the draw, people can send
  anonymous messages to their Santa or the person they're buying for (good for "what size
  are you?"), and the organizer can reveal who had whom once gifts are opened.
- Mobile friendly, with light and dark mode. **Installable as an app** on phones and
  computers (Add to Home Screen / Install). Once installed, it shows up in the phone's
  share menu: share a product from a store app to add it to a list.
- **Tester accounts**: tick `tester` on a user in the admin dashboard (`/admin` → users).
  That account then sees its own share links exactly as friends do, reservations included,
  and can reserve its own gifts, so you can try everything with one account. Only admins
  can set it.

## Quick start (Docker)

Putting it on a server with easy updates: see **[DEPLOY.md](DEPLOY.md)**.

```bash
cp .env.example .env      # then edit .env
docker compose up -d --build
```

Open <http://localhost:8090>. The PocketBase admin dashboard is at <http://localhost:8090/admin> (or `/_/`)
(log in with `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` from `.env`).

Without compose:

```bash
docker build -t giftlist .
docker run -d -p 8090:8090 --env-file .env -v giftlist_data:/pb/pb_data giftlist
```

## Configuration

All settings come from environment variables (see [.env.example](.env.example)) and are
applied every time the container starts.

| Variable | Description |
| --- | --- |
| `APP_NAME` | Name shown in the UI and emails |
| `APP_URL` | Public URL of the app. Used for links in emails, so set it to your real domain |
| `APP_CURRENCY` | ISO currency code for prices (`USD`, `EUR`, `GBP`…) |
| `HOST_PORT` | Host port published by docker compose (default `8090`) |
| `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` | Admin dashboard account, created or updated on start |
| `SMTP_HOST` | SMTP server. Leave empty to turn email off |
| `SMTP_PORT` | Usually `587` (STARTTLS) or `465` (TLS) |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | SMTP credentials |
| `SMTP_TLS` | `true` for implicit TLS (port 465), `false` for STARTTLS |
| `SMTP_AUTH_METHOD` | `PLAIN` (default) or `LOGIN` |
| `SMTP_SENDER_ADDRESS` / `SMTP_SENDER_NAME` | The "From" for all emails (the name defaults to `APP_NAME`) |
| `BRAVE_SEARCH_KEY` | Brave Search API key for photo search in the gift editor. Leave empty to hide it |
| `TZ` | Time zone for the nightly follower emails, e.g. `America/Denver` (default UTC) |
| `DIGEST_HOUR` | Hour (0–23) to send follower emails and occasion reminders (default `0`, midnight) |
| `RESERVATION_DAYS` | How long a reservation lasts before it must be renewed (default `7`) |
| `EMAIL_ACCENT` | Button and logo color in emails, as `#rrggbb` (default `#c8364f`) |

You can also change SMTP in the admin dashboard (**Settings → Mail settings**), but
values set through env vars win on restart.

The auth emails (verification, password reset, email change, sign-in code, new sign-in
alert) are installed into the `users` collection on every start, so they stay in sync with
`pb_hooks/lib/mails.js`. To customize one in the admin dashboard (**Collections → users →
Options**) and keep your edits, delete the `<!-- giftlist-template:v2 -->` comment from it;
templates without that marker are never overwritten.

To keep emails out of spam folders, send from an address on your own domain and set up
SPF, DKIM and DMARC for it with your mail provider.

**Gmail example:** `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_TLS=false`, your
Gmail address as username and an [app password](https://myaccount.google.com/apppasswords)
as password.

If email isn't configured, everything still works except emails themselves (invitations,
reservation emails, follows, reminders, questions, price drops, verification and password
reset). The Follow button is hidden when email is off.

## Running behind a reverse proxy

Point your proxy at port 8090 and set `APP_URL` to the public `https://` URL. To keep
real client IPs in the logs, set **Settings → Application → Trusted proxy** in the admin
dashboard. Uploads are limited to 5 MB per image.

**Rate limits** are on by default (sign-ins 5 per 10 seconds per IP, creating records 50
per 10 seconds, product previews 20 a minute, photo searches 10 a minute, everything else
300 per 10 seconds). Behind a proxy, set the trusted proxy header above, or every visitor
shares the proxy's IP and its limits. Change them under **Settings → Application → Rate
limiting**.

## How sharing and privacy work

- Each list has a random 24 character `share_token`. The share link is `/s/<token>`.
- The frontend sends the token in an `X-Share-Token` header. PocketBase API rules only
  return a list, its items and reservations when the header matches, so lists can't be
  enumerated or guessed.
- Reservation rules exclude the list owner, so even the raw API never shows an owner
  their reservations.
- Only one reservation per item (unique index). Only the person who reserved it can
  cancel it. Pledges (chip in) follow the same rules: hidden from the owner, one per
  person per gift.
- Questions never store who asked in a field the API returns (`asker` is hidden), so not
  even the raw API tells the owner. Secret Santa messages are only reachable through the
  routes below, which never name a Santa until the organizer reveals.
- **Reset link** in the share dialog creates a new token, and the old link stops working.

## Development

Requirements: Node 20+ and the [PocketBase binary](https://github.com/pocketbase/pocketbase/releases)
(v0.40.x).

```bash
# terminal 1: backend on :8090
cd pocketbase
pocketbase serve --hooksDir ./pb_hooks --migrationsDir ./pb_migrations

# terminal 2: frontend on :5173 (proxies /api to :8090)
cd web
npm install
npm run dev
```

Put `APP_URL`, `SMTP_*` etc. in your environment before starting PocketBase to test email.

On Windows, PocketBase doesn't reload hooks when files change; restart it after editing
`pb_hooks`.

### Tests

```bash
node tests/run.mjs            # unit tests (product page parsing, Secret Santa draw)
node tests/run.mjs --api      # plus the API tests, against a running test server
```

The API tests create throwaway users and lists, so run them against a separate test
server, never your real one. They need:

- `TEST_URL`: the test server (default `http://127.0.0.1:8090`)
- `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD`: a superuser on it (used to trigger the
  scheduled jobs and to pause rate limits while the tests run)
- `TEST_MAIL_DIR`: where the mail catcher writes (default `tests/.mail`)

Start the mail catcher with `node tests/mailsink.cjs`, then start the test server with
`SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_TLS=false` and `DIGEST_HOUR` set to the current
hour (the occasion reminder test runs the nightly job).

## Project layout

```
Dockerfile                multi-stage: builds the SPA, then a slim PocketBase image
docker-compose.yml
docker-entrypoint.sh      creates the admin account and starts PocketBase
pocketbase/
  pb_migrations/          collections, API rules, default categories
  pb_hooks/main.pb.js     env → settings, emails, share/preview/photo endpoints, app manifest
  pb_hooks/*.pb.js        reservations, follows, pledges, questions, prices, thanks,
                          exchanges (Secret Santa), emails (unsubscribe)
  pb_hooks/lib/util.js    shared helpers (dates, email sending, unsubscribe tokens)
  pb_hooks/lib/digest.js  nightly follower emails and occasion reminders
  pb_hooks/lib/email.js   shared HTML email layout
  pb_hooks/lib/mails.js   every email the app sends (invites, reminders, auth emails)
tests/                    unit and API tests, mail catcher (see Tests above)
web/                      React frontend (Vite)
  src/pages/              Dashboard, ListEditor, SharedList, Account, auth pages
  src/components/         ItemEditor, ItemCard, SharePanel, ListForm, …
```

### Data model

| Collection | Purpose |
| --- | --- |
| `users` | Built-in PocketBase auth collection (`name`, `avatar`, `prefs`, `email_prefs` (emails turned off), `email_hash` (for Gravatar, set by the server), `tester`, which only admins can set, `guest`: signed up with an email code and hasn't set a password yet). Email-code (OTP) sign-in is on |
| `lists` | `owner`, `title`, `occasion`, `event_date`, `description`, `share_token`, `owner_name`, `reveal_givers`, `theme`, `cover` (file), `friend_view`, `private` (ideas board: share-token rules all require `private = false`) |
| `items` | `list`, `name`, `url`, `price`, `quantity`, `priority`, `category`, `image` (file), `image_url`, `description`, `received`, `thanked`; set by the server: `current_price`, `price_checked`, `price_alerted` |
| `categories` | `name`, `icon`, `owner` (empty = built-in) |
| `reservations` | `item`, `user`, `reserver_name`, `purchased`, `expires`, `reminded`. Never visible to the list owner |
| `pledges` | Chip in: `item`, `user`, `reserver_name`, `amount`. Never visible to the list owner |
| `questions` | `list`, `item`, `asker` (hidden), `question`, `answer`, `answered_at` |
| `follows` | Shared lists a user has opened (for the dashboard). `notify` = pressed Follow; `notified_at` = last nightly email; `occasion_reminded` = date of the last week-before reminder |
| `exchanges` | Secret Santa: `owner`, `name`, `event_date`, `budget`, `currency`, `message`, `status` (open/drawn), `join_token`, `revealed` |
| `exchange_messages` | Anonymous Santa messages: `exchange`, `from`, `to`, `text`. Only reachable through the API routes below |
| `exchange_members` | `exchange`, `user`, `name`, `email`, `list`, `exclusions`, `recipient` (hidden). Only reachable through the API routes below |

### Custom API endpoints

- `GET  /api/giftlist/config`: app name, whether SMTP and photo search are on, currency
- `POST /api/giftlist/lists/{id}/share`: email the share link (`{ emails: [], message }`), owner only
- `GET  /api/giftlist/preview?url=…`: fetch title, image and price from a product page (logged-in users)
- `GET  /api/giftlist/images?q=…`: photo search via Brave (logged-in users, needs `BRAVE_SEARCH_KEY`)
- `POST /api/giftlist/reservations/{id}/renew`: keep your reservation for another week
- `GET  /api/giftlist/lists/{id}/givers`: who reserved or chipped in on each gift, owner only, after the list's date and only with `reveal_givers` on
- `POST /api/giftlist/guest`: `{ name, email }` makes a guest account if there isn't one (same answer either way), before PocketBase's `request-otp` / `auth-with-otp` sign in with an emailed code
- `POST /api/giftlist/account/password`: a guest sets their first password (`{ password, passwordConfirm }`)
- `POST /api/giftlist/unsubscribe?u&k&t`: one-click unsubscribe from one kind of email (`{ resubscribe: true }` undoes it)
- `GET  /manifest.webmanifest`: the installable app manifest (with share target `/share`)
- Secret Santa (logged-in users):
  - `GET  /api/giftlist/exchanges` and `GET /api/giftlist/exchanges/{id}`: your exchanges, and one exchange with its members and your match
  - `POST /api/giftlist/exchanges/{id}/invite`: email invitations (`{ emails }`), organizer only
  - `GET|POST /api/giftlist/join/{token}`: preview an exchange, or join it (`{ list }`)
  - `POST /api/giftlist/exchanges/{id}/my-list`: choose the wish list your Santa sees (`{ list }`)
  - `POST /api/giftlist/exchanges/{id}/members/{mid}/exclusions`: "can't draw" rules (`{ exclude: [] }`), organizer only
  - `POST /api/giftlist/exchanges/{id}/members/{mid}/remove`: remove someone, or leave
  - `POST /api/giftlist/exchanges/{id}/draw`: draw (or redraw) names and email everyone, organizer only
  - `POST /api/giftlist/exchanges/{id}/reveal`: show everyone who their Santa was (`{ hide: true }` hides it again), organizer only
  - `GET|POST /api/giftlist/exchanges/{id}/messages`: your two anonymous threads, or send one (`{ to: "santa" | "recipient", text }`)

Scheduled jobs: `giftlist_reservations` (every 15 minutes: release and remind),
`giftlist_follow_digest` (hourly; sends at `DIGEST_HOUR`), `giftlist_price_checks`
(hourly, 15 gifts at a time).

## Backups

Everything (database and uploaded images) lives in the `giftlist_data` volume at
`/pb/pb_data`. PocketBase makes a backup every night at 3am and keeps the last 7, in
`pb_data/backups` (so inside the same volume: copy them somewhere else now and then, or
point backups at S3). Change this, download or restore backups in the admin dashboard
(**Settings → Backups**).
