# Ghost + Lock

Two black-and-white web apps that work in tandem, installable on iPhone and Mac from Safari. 100% free. No server, no accounts — everything lives encrypted on your device.

- **Ghost** (`/ghost/`) — clean up the past: data-broker removal (24 sites, demand letters written for you), old-account deletion (22 services, direct delete links), junk-email kill list, leaked-password checks.
- **Lock** (`/lock/`) — protect the present: whole-device ad/tracker/malware DNS shield (free), scam-link checker, password strength + stolen check, 21 guided "shields" for iPhone, Mac, and browsing.

## Security model (plain English)

- One password (set once, shared by both apps). It is turned into an encryption key (PBKDF2, 250k rounds) — the password itself is never stored.
- Everything saved is AES-256-GCM encrypted on the device. No cloud. No server. Nothing to hack from outside.
- Face ID / Touch ID unlock uses a passkey (WebAuthn + PRF): the Secure Enclave gates a wrapped copy of the key. If the browser doesn't support PRF, the password always works.
- App locks itself the moment it's hidden/backgrounded.
- There is **no password recovery** — that is the point. Don't forget it.

## Run it right now (Mac)

```bash
python3 -m http.server 8420 --directory ~/ghost-lock --bind 127.0.0.1
```

Then open http://localhost:8420 in Safari.

## Put it on your iPhone (needs free HTTPS hosting)

iPhones require HTTPS for the vault crypto, Face ID, and Add-to-Home-Screen. Two free options:

**Cloudflare Pages (recommended):** create a free Cloudflare account → Workers & Pages → Create → Pages → upload this folder (or connect a repo). You get `https://yourname.pages.dev`.

**GitHub Pages:** push this folder to a public repo → Settings → Pages → deploy from branch. Public code is fine — there are no secrets in it; all your data stays on-device.

Then on the iPhone: open `https://.../ghost/` in Safari → Share → **Add to Home Screen**. Repeat for `/lock/`. On Mac: open in Safari → File → **Add to Dock**.

Both apps on the same domain share one vault: set the password once, turn on Face ID once.

## Files

- `shared/` — design system, encrypted vault, Face ID auth, lock shell, datasets, engine (breach check, link checker, letter writer)
- `ghost/`, `lock/` — the two PWAs (each: index.html, app.js, manifest, service worker)
- `icons/` — app icons (white ghost / white padlock on black)
