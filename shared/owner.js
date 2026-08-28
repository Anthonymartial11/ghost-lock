/* owner.js — the owner-code gate.
 *
 * What this IS: a deterrent that stops a casual passer-by who finds the public
 * URL from setting the app up. First-time setup asks for the owner code.
 *
 * What this is NOT: real protection of your data. This check runs in the
 * browser, so a technical attacker can bypass it, and the hash below is public
 * on GitHub. Your actual security is your PASSWORD + encryption (see vault.js).
 * Because the hash is public, the owner code must be a throwaway random string
 * you NEVER reuse as a password anywhere. Generate one with:
 *   python3 tools/set-owner-code.py --random
 *
 * Only a salted PBKDF2-SHA256 (300k) fingerprint of the code lives here — never
 * the code itself.
 */
window.OWNER = {
  saltHex: '94cbd556a1200cbebb536cd9c528c541',
  hashHex: 'dbc4abcf5765ff0e46bc67347e69479163e2c3006e9a55252003d3d575adb65b',
  iterations: 300000
};
