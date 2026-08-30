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
| **Vultr** | **$3.50/mo** | Cheapest with a real IPv4. US cities incl. close to you. Recommended. |
| AWS Lightsail | $5/mo | 1 TB transfer, very reliable |
| DigitalOcean | $6/mo | 1 TB transfer, easiest console |
| Hetzner | €5.99/mo EU | Cheap in Europe only — the US plan jumped to €17.49/mo in June 2026 |
| ~~Oracle "Always Free"~~ | £0 | **Do not use for this.** See below. |

**Why not Oracle's free tier** (verified August 2026): Oracle explicitly reserves
the right to reclaim *idle* instances — and a personal VPN server meets their
definition of idle, so it can be deleted under you. They halved the free ARM
allowance in June 2026 with no announcement and deleted over-limit instances,
and they have a documented pattern of terminating free accounts with no warning
or appeal. They also paid **$115M** in 2025 to settle a class action over
covertly building profiles on ~220 million people. Wrong landlord for a privacy
tool.

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

## Honest limits — read before you rely on this

**1. Your anonymity set is one.** Anonymity means being indistinguishable inside
a crowd. A crowd of one is not weak anonymity, it is *zero* anonymity. A
commercial VPN's shared exit IP hides your activity *patterns*, not just your
address. Your own server converts a rotating home IP into a **permanent, globally
unique identifier rented in your name**. For defeating ad-tracking, that is worse
than what you have now. This is not a nitpick — the leading self-hosting tool's
own authors disclaim anonymity as a goal.

**2. The hosting provider sits on both sides.** They carry your outbound traffic
(destination IPs, the site names inside TLS) *and* know the tunnel's other end —
your home IP. And virtualisation means they can snapshot both the disk **and the
RAM** of your server from the hypervisor; that is standard forensic procedure,
not a hypothetical. So the "logs in RAM only" hardening in this build raises the
bar, but it does **not** make the box unreadable the way it would on hardware you
physically own. A commercial VPN's business model is adversarial to disclosure;
a hosting company's is not — they have no reason to fight for you.

**3. WireGuard itself keeps two things.** By design the server holds your current
endpoint (your home IP) and last-handshake time in kernel memory, and the config
on disk maps your public key to a fixed tunnel address. WireGuard's own
documentation lists the seized-server case as a known limitation. There is no
setting that removes this.

**4. A datacenter IP is flagged as an anonymiser by default**, purely for being
in a hosting range — providers publish those ranges, so it is trivial to detect.
Expect some sites to challenge you. (Upside: with only you on the IP, you will
generally get *fewer* CAPTCHAs than on a busy commercial VPN, and banks tend to
behave better.)

**5. One server pins you to one country.** No location switching.

**6. Your keys are in `~/GhostTunnel/`.** Those files *are* the tunnel. Anyone
holding them can connect as you. Keep them private and delete stray copies.

---

## So what should you actually use?

Match the tool to the threat — this is the practitioner consensus, not a fudge:

- **Hostile Wi-Fi (cafe, hotel, airport) and hiding from your ISP** →
  **Ghost Tunnel.** This is the clearest, least-disputed win, and it removes the
  VPN company as someone you must trust.
- **Defeating ad-tracking / blending into a crowd** → a commercial VPN, or
  better, fix it at the source with Ghost's *Cut Big Tech down* and Lock's
  tracker blocking. IP is only one signal; logging into Google beats any VPN.
- **Genuine anonymity** → **Tor Browser.** Nothing else qualifies. Both kinds of
  VPN are the wrong tool and the reputable privacy projects say so plainly.
