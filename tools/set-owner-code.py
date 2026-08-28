#!/usr/bin/env python3
"""Change the Ghost+Lock owner code.

Usage:
  python3 tools/set-owner-code.py "MY-NEW-CODE"     # set a code you choose
  python3 tools/set-owner-code.py --random           # generate a strong one

Rewrites shared/owner.js with a fresh salt + hash. Devices that already have
a vault are unaffected — the code is only asked for when setting up a new device.
"""
import sys, secrets, hashlib, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "shared" / "owner.js"
ITER = 300000

def main():
    if len(sys.argv) != 2:
        print(__doc__); sys.exit(1)
    if sys.argv[1] == "--random":
        alpha = "ABCDEFGHJKMNPQRSTVWXYZ23456789"
        code = "GHOST-" + "-".join("".join(secrets.choice(alpha) for _ in range(4)) for _ in range(3))
    else:
        code = sys.argv[1].strip()
        if len(code) < 10:
            print("Use at least 10 characters — this hash will be public."); sys.exit(1)
    salt = secrets.token_bytes(16)
    h = hashlib.pbkdf2_hmac("sha256", code.encode(), salt, ITER)
    OUT.write_text(f"""/* owner.js — this app belongs to ONE person.
 *
 * Setting up the app on a new device requires the owner code. Without it,
 * the public page is a locked door: strangers can look, but can't use it.
 *
 * Only a scrambled fingerprint (PBKDF2-SHA256, 300k rounds + salt) of the code
 * lives here — the code itself is never in the source. To change the code:
 *   python3 tools/set-owner-code.py "YOUR-NEW-CODE"
 */
window.OWNER = {{
  saltHex: '{salt.hex()}',
  hashHex: '{h.hex()}',
  iterations: {ITER}
}};
""")
    print("Owner code set to:", code)
    print("Wrote", OUT)
    print("Keep the code somewhere safe. Redeploy for it to take effect.")

if __name__ == "__main__":
    main()
