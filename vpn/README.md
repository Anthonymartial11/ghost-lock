# Ghost Tunnel — your own VPN

No VPN company. No promises to trust. You own the server, you hold the keys,
and there are no logs to seize.

---

## Read this first: what it does and does NOT do

**It DOES:**
- Hide your home IP and city from every website, in every app.
- Stop your ISP, your mobile carrier, and any Wi‑Fi you join (hotel, cafe,
  airport) from seeing which sites you visit.
- Run **your own recursive DNS resolver** — no DNS company sees your lookups at
  all, not even a "privacy-friendly" one. Blocklists kill ads, trackers and
  malware domains before they resolve.
- Leave nothing behind: logs live in RAM and die on reboot, swap is off, so key
  material never touches the disk.

**It does NOT make you anonymous — and this is the part most guides hide:**

A commercial VPN puts you behind an IP shared by hundreds of strangers. That
crowd is the disguise. **Your own server has an exit IP that only you ever use.**
Against a tracker, a permanent IP that belongs solely to you is a *stable,
unique identifier* — in that one narrow sense it can be worse than your home IP.

So:

| Goal | Ghost Tunnel | Commercial VPN | Tor |
|---|---|---|---|
| Hide from ISP / public Wi-Fi | **Best** | Good | Good |
| Hide your home location | **Yes** | Yes | Yes |
| Blend into a crowd | **No** | Yes | **Best** |
| Trust no company | **Yes** | No | **Yes** |
| Everyday speed | **Fast** | Fast | Slow |

**Use Ghost Tunnel as your daily tunnel. Use Tor Browser for the handful of
things that need real anonymity.** They solve different problems.

Also: hiding your IP does nothing while you are logged into Google or Facebook —
they know who you are regardless. That is what Ghost's "Cut Big Tech down" is for.

---

## What you need

A cheap Linux server (a "VPS") running Ubuntu 22.04/24.04 or Debian 12.

| Option | Cost | Notes |
|---|---|---|
| Hetzner | ~€4/mo | Cheapest reliable, EU + US locations |
| Vultr / DigitalOcean | ~$5–6/mo | Many cities |
| Oracle Cloud "Always Free" | £0 | Genuinely free forever, but signup is fiddly and idle instances can be reclaimed |

Pick a location **away from your home city** — that is the point.
Add your SSH key during signup so you can log in without a password.

---

## Setup (one command)

```bash
cd ~/ghost-lock/vpn
./setup.sh <your-server-ip>
```

That will:
1. Generate a private key for each device **on your Mac** — it never leaves.
2. Send **only the public keys** to the server.
3. Install and harden the server (WireGuard, own DNS, firewall, no logging).
4. Write your profiles to `~/GhostTunnel/`.

Then:
- **Mac** — install WireGuard from the Mac App Store → *Import Tunnel(s) from
  File…* → `~/GhostTunnel/ghost-mac.conf`
- **iPhone** — install WireGuard from the App Store → AirDrop
  `~/GhostTunnel/ghost-iphone.conf` to the phone → open it in WireGuard.

Add more devices later:
```bash
./add-device.sh <your-server-ip> ipad
```

---

## Prove it works — don't take my word

1. Visit **https://ipleak.net** with the tunnel OFF. Note your IP and city.
2. Turn the tunnel ON. Reload.
   - IP and city must now be **the server's**, not yours.
   - **DNS servers must NOT show your ISP.** If they do, you have a DNS leak.
3. On iPhone, turn on **On-Demand** in the WireGuard app so it reconnects
   automatically — a VPN that is off protects nothing.

---

## What the server hardening actually does

- **WireGuard** — modern, small, audited. Far less attack surface than OpenVPN.
- **Pre-shared keys** — an extra symmetric layer on top of WireGuard's own
  encryption, per device.
- **Unbound** — our own recursive resolver with DNSSEC and QNAME minimisation,
  reachable only from inside the tunnel. Weekly ad/tracker/malware blocklist.
- **journald → RAM only**, rsyslog removed, **swap off**. Nothing persists.
- **nftables** default-deny. Only SSH (rate-limited) and the tunnel port answer.
- **SSH** — keys only, no passwords, no root password login, 3 tries.
- **unattended-upgrades** — security patches apply themselves.

## Honest limits

- Your **VPS provider** can still see traffic at their edge and knows who you
  are from payment. You have swapped a VPN company for a hosting company — but
  one that has no idea what you are doing and no reason to profile you.
- A **unique exit IP** is a tracking identifier (see the table above).
- If the server is compromised, the tunnel is compromised. Patches are automatic
  for this reason.
- Your keys are in `~/GhostTunnel/`. **Those files are the tunnel.** Anyone with
  them can connect as you. Keep them private; delete stray copies.
