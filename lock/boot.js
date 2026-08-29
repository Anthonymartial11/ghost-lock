/* boot.js — must load FIRST. Exists as a file (not inline) so the page can run
   a strict Content-Security-Policy: script-src 'self' means an injected inline
   <script> can never execute.

   FRAME BUSTING: this app must never render inside another page's frame.
   Framing enables clickjacking, and a same-origin framer could otherwise reach
   into this window and read the unlocked vault. If we're framed, we blank the
   page and try to break out. (frame-ancestors can't be set via meta CSP, and
   GitHub Pages can't send headers — so we enforce it ourselves.)
*/
if (window.top !== window.self) {
  try { document.documentElement.innerHTML = ''; } catch (e) {}
  try { window.top.location = window.self.location.href; } catch (e) {}
  try { window.stop(); } catch (e) {}
  throw new Error('framing blocked');
}

window.GL_DB = 'ghostlock-lock';
window.addEventListener('load', ()=>{
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
});
