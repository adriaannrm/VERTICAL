/* VERTICAL — service worker.
   Guarda la app entera en el móvil la primera vez que la abres. A partir de ahí
   arranca desde la caché: instantánea, y funciona con el móvil en modo avión.

   Para forzar una actualización tras cambiar la app, sube CACHE una versión. */

const CACHE = 'vertical-v3';

/* Peticion que salta la cache HTTP del navegador.
   GitHub Pages sirve con 10 min de cache, asi que sin esto el refresco pedia el
   fichero y el navegador le devolvia el viejo que ya tenia guardado: la app se
   refrescaba consigo misma y las actualizaciones no llegaban nunca. */
const fresco = url => fetch(new Request(url, { cache: 'reload', credentials: 'same-origin' }));
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-180.png',
  './icon-192.png',
  './icon-512.png'
];

/* skipWaiting() se llama suelto, NO devuelto dentro de waitUntil: si se
   encadena ahí, la activación espera a la instalación y la instalación espera a
   la activación, y el worker se queda colgado sin llegar a cachear nada.

   Y se cachea fichero a fichero a propósito: con addAll(), si uno solo falla se
   cae la instalación entera y te quedas sin modo sin conexión. */
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await Promise.all(ASSETS.map(a =>
      fresco(a).then(res => res.ok ? c.put(a, res) : null).catch(() => { })
    ));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const viejas = (await caches.keys()).filter(k => k !== CACHE);
    await Promise.all(viejas.map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

/* Primero la caché: en el gimnasio no dependemos de la red para nada.
   En segundo plano refrescamos, por si has subido una versión nueva. */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith((async () => {
    const guardar = res => {
      if (res && res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
      return res;
    };

    const hit = await caches.match(req);
    if (hit) {
      fresco(req.url).then(guardar).catch(() => { });   // refresco silencioso, sin caché HTTP
      return hit;
    }
    try {
      return guardar(await fetch(req));
    } catch (err) {
      /* Sin red y sin copia. Solo tiene sentido servir la app si lo que se
         pedía era una página; para una imagen, devolver HTML sería mentir. */
      if (req.mode === 'navigate') {
        const app = await caches.match('./index.html');
        if (app) return app;
      }
      throw err;
    }
  })());
});
