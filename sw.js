const C="andybarber-v4",A=["./","index.html","manifest.webmanifest","icon-v3-192.png","icon-v3-512.png","apple-touch-icon-v3.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(A)));self.skipWaiting()});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});
// Notificaciones push (llegan con la app cerrada)
self.addEventListener("push",e=>{let p={};try{p=e.data?e.data.json():{}}catch(_){}
  const n=p.data||p.notification||p||{};
  e.waitUntil(self.registration.showNotification(n.title||"AndyBarber",{body:n.body||"",icon:"icon-v3-192.png",badge:"icon-v3-192.png",tag:n.tag||undefined,renotify:!!n.tag,data:{url:n.url||"./"}}))});
self.addEventListener("notificationclick",e=>{e.notification.close();const u=(e.notification.data&&e.notification.data.url)||"./";
  e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if("focus"in c)return c.focus()}return clients.openWindow(u)}))});
