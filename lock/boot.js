/* boot.js — must load FIRST. Exists as a file (not inline) so the page can run
   a strict Content-Security-Policy: script-src 'self' means an injected inline
   <script> can never execute. */
window.GL_DB = 'ghostlock-lock';
window.addEventListener('load', ()=>{
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
});
