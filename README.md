# Ghost + Lock

Two black-and-white web apps that work in tandem, installable on iPhone and Mac from Safari. 100% free. No server, no accounts — everything lives encrypted on your device.

- **Ghost** (`/ghost/`) — clean up the past: data-broker removal (24 sites, demand letters written for you), old-account deletion (22 services, direct delete links), junk-email kill list, leaked-password checks.
- **Lock** (`/lock/`) — protect the present: whole-device ad/tracker/malware DNS shield (free), scam-link checker, password strength + stolen check, 21 guided "shields" for iPhone, Mac, and browsing.

## Security model (plain English)

- Each app has its **own independent vault and password** (iOS gives each installed web app isolated storage, so this is also the only honest cross-platform design — and a breach of one app can never touch the other). Set up the password **inside the installed app**, not in the Safari tab.
- The password is turned into an encryption key with PBKDF2-SHA256 at **600k rounds** (OWASP-current) — the password itself is never stored. Minimum 10 characters; a phrase is best.
- Everything saved is AES-256-GCM encrypted on the device. No cloud. No server. The live key is non-extractable.
- Face ID / Touch ID unlock uses a passkey (WebAuthn + PRF): the Secure Enclave gates a wrapped copy of the key, and setup round-trip-verifies before reporting success. Note: on iOS, biometric unlock inherits the device-passcode fallback — the app warns about this at setup. If the browser doesn't support PRF, the password always works.
- The app locks the moment it is backgrounded (open bottom sheets are closed too), and an unlock that finishes after backgrounding re-locks instead of revealing anything. Tapping an in-app "open their page" button does not trigger the lock.
- There is **no password recovery** — that is the point. Don't forget it.

**Deterrents (honesty section — these slow an attacker, they are not the encryption):**
- **Owner code** at first-time setup: stops a casual passer-by who finds the public URL from using the app. It is a client-side check, so a technical attacker can bypass it — they gain only a fresh empty vault, never your data. Its salted PBKDF2-300k fingerprint is public in `shared/owner.js`, so the code must be a random throwaway you never reuse anywhere. Rotate: `python3 tools/set-owner-code.py --random`.
- **Escalating wrong-password time-outs** (30s → 1m → 5m → 15m → 1h), remembered across restarts; even the correct password is refused mid-timeout. This throttles guessing at the screen. Someone who extracts the encrypted store can guess offline — which is why the real defense is your password's strength × the 600k-round KDF.
- Even with the page public, **your data can't be reached**: it exists only AES-encrypted inside your own devices' browser storage. There is nothing on GitHub but code.
- Pages carry `noindex` and the repo ships a `robots.txt` — search engines are told to stay away.

**Hosting caveat:** browser storage is shared per *origin*. Every repo published under the same `username.github.io` shares one origin, so never publish other pages (especially anything loading third-party scripts) on the GitHub account that hosts Ghost + Lock. Keep this account for these apps only, or move to a dedicated domain.

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
