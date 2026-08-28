/* owner.js — this app belongs to ONE person.
 *
 * Setting up the app on a new device requires the owner code. Without it,
 * the public page is a locked door: strangers can look, but can't use it.
 *
 * Only a scrambled fingerprint (PBKDF2-SHA256, 300k rounds + salt) of the code
 * lives here — the code itself is never in the source. To change the code:
 *   python3 tools/set-owner-code.py "YOUR-NEW-CODE"
 */
window.OWNER = {
  saltHex: '94cbd556a1200cbebb536cd9c528c541',
  hashHex: 'dbc4abcf5765ff0e46bc67347e69479163e2c3006e9a55252003d3d575adb65b',
  iterations: 300000
};
