/* Lock service worker — instant loads, works offline. */
const CACHE = 'lock-v5';
const ASSETS = [
  'index.html','app.js','boot.js','manifest.webmanifest',
  '../shared/base.css','../shared/owner.js','../shared/vault.js','../shared/auth.js','../shared/ui.js',
  '../shared/shell.js','../shared/tools.js',
  '../icons/lock-180.png','../icons/lock-192.png','../icons/lock-512.png'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(
    keys.filter(k=>k!==CACHE && k.startsWith('lock-')).map(k=>caches.delete(k))
  )).then(()=>self.clients.claim()));
});
/* network-first: updates show up immediately; cache only kicks in offline */
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if(e.request.method!=='GET' || url.origin!==location.origin) return;
  e.respondWith(
    fetch(e.request, {cache:'no-cache'}).then(res=>{
      if(res.ok){                       // never cache a 404/500 over a good asset
        const copy=res.clone();
        caches.open(CACHE).then(c=>c.put(e.request, copy));
      }
      return res;
    }).catch(async ()=>{
      const hit = await caches.match(e.request, {ignoreSearch:true});
      if(hit) return hit;
      if(e.request.mode==='navigate') return caches.match('index.html'); // trailing-slash URL
      return Response.error();
    })
  );
});
