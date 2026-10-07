/* Mi Casa · Gastos — V6 auto-update */
const VERSION = "2026.10.07-955-easy-use";
const CACHE = `mi-casa-${VERSION}`;
const APP_SHELL = ["./","./index.html","./styles.css","./app.js","./manifest.json","./update-notifier.js","./icons/icon.svg"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    clients.forEach(c=>c.postMessage({type:"MI_CASA_UPDATED",version:VERSION}));
  })());
});
self.addEventListener("message", event => { if(event.data?.type==="SKIP_WAITING") self.skipWaiting(); });
self.addEventListener("fetch", event => {
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url); if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    try{
      const fresh=await fetch(event.request,{cache:"no-store"});
      const cache=await caches.open(CACHE); cache.put(event.request,fresh.clone());
      return fresh;
    }catch{
      return (await caches.match(event.request)) || (event.request.mode==="navigate" ? caches.match("./index.html") : undefined);
    }
  })());
});
