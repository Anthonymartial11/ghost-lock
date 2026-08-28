/* Ghost service worker — makes the app load instantly and work offline. */
const CACHE = 'ghost-v2';
const ASSETS = [
  'index.html','app.js','manifest.webmanifest',
  '../shared/base.css','../shared/owner.js','../shared/vault.js','../shared/auth.js','../shared/ui.js',
  '../shared/shell.js','../shared/data-brokers.js','../shared/delete-accounts.js','../shared/tools.js',
  '../icons/ghost-180.png','../icons/ghost-192.png','../icons/ghost-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE && k.startsWith('ghost-')).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
/* network-first: updates show up immediately; cache only kicks in offline */
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(e.request.method!=='GET' || url.origin!==location.origin) return; // never touch API calls
  e.respondWith(
    fetch(e.request, {cache:'no-cache'}).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(e.request, copy));
      return res;
    }).catch(()=>caches.match(e.request, {ignoreSearch:true}))
  );
});
