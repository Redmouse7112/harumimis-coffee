// Service Worker: cache-first con actualizacion en segundo plano.
// Pensado para el bundle de /dist (index.html + manifest.json + iconos, todos
// en el mismo directorio que este archivo). Critico para uso offline en
// eventos sin señal garantizada.
// build.py reemplaza el placeholder del nombre del cache (el sufijo "dunder
// BUILD_ID" de abajo) por un hash del contenido de cada build: cada version
// nueva tiene su propio cache y el activate borra los viejos.
var CACHE_NAME = 'harumimi-coffee-__BUILD_ID__';
var PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache:'reload' saltea el cache HTTP del navegador/GitHub Pages para
      // no precachear un index.html viejo al instalar la version nueva.
      .then(function(cache){
        return cache.addAll(PRECACHE.map(function(u){ return new Request(u, {cache:'reload'}); }));
      })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){ return k!==CACHE_NAME; })
            .map(function(k){ return caches.delete(k); })
      );
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  if(event.request.method!=='GET') return;
  if(new URL(event.request.url).origin!==location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function(cached){
      var network = fetch(event.request).then(function(res){
        if(res && res.ok){
          var copy=res.clone();
          caches.open(CACHE_NAME).then(function(cache){ cache.put(event.request, copy); });
        }
        return res;
      }).catch(function(){ return cached; });
      return cached || network;
    })
  );
});
