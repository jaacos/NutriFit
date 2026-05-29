/**
 * NutriFit Coach — Service Worker
 *
 * Estrategia por tipo de recurso:
 *   • App shell (HTML, manifest)      → Cache First  (offline garantizado)
 *   • Assets externos (CDN fonts/CSS) → Stale While Revalidate
 *   • APIs (Gemini, Firebase)         → Network Only (nunca se cachean)
 *   • Resto                           → Network First con fallback a caché
 */
 
const CACHE_VERSION  = 'v2';
const CACHE_SHELL    = `nutrifit-shell-${CACHE_VERSION}`;
const CACHE_ASSETS   = `nutrifit-assets-${CACHE_VERSION}`;
const ALL_CACHES     = [CACHE_SHELL, CACHE_ASSETS];
 
// Recursos del app shell: se pre-cachean en la instalación
// Si no tienes icon-192.png / icon-512.png aún, elimínalos de esta lista
// para evitar que la instalación falle
const SHELL_ASSETS = [
  './index.html',
  './manifest.json'
];
 
// Assets de CDN que se cachean con estrategia Stale-While-Revalidate
// (se sirve la versión cacheada y se actualiza en background)
const CDN_ORIGINS = [
  'cdn.tailwindcss.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];
 
// URLs de API que NUNCA se cachean (siempre red)
const API_ORIGINS = [
  'generativelanguage.googleapis.com',   // Gemini
  'firestore.googleapis.com',            // Firestore
  'identitytoolkit.googleapis.com',      // Firebase Auth
  'securetoken.googleapis.com',          // Firebase Auth tokens
  'firebase.googleapis.com',
  'gstatic.com/firebasejs'
];
 
/* ─── INSTALACIÓN ──────────────────────────────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_SHELL)
      .then(cache => cache.addAll(SHELL_ASSETS))
      .then(() => {
        console.log('[SW] Shell cacheado correctamente');
        return self.skipWaiting(); // activa el nuevo SW sin esperar
      })
      .catch(err => {
        // Si algún asset del shell falla (p.ej. iconos no existen),
        // el SW se instala igualmente sin bloquear la app
        console.warn('[SW] Error precacheando shell (no crítico):', err);
        return self.skipWaiting();
      })
  );
});
 
/* ─── ACTIVACIÓN ───────────────────────────────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => !ALL_CACHES.includes(name))
          .map(name => {
            console.log('[SW] Eliminando caché obsoleta:', name);
            return caches.delete(name);
          })
      ))
      .then(() => {
        console.log('[SW] Activado y cachés limpias');
        return self.clients.claim(); // toma el control inmediatamente
      })
  );
});
 
/* ─── FETCH ────────────────────────────────────────────────────────── */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);
 
  // Solo interceptamos GET (POST/PUT van directo a red)
  if (request.method !== 'GET') return;
 
  // ── 1. APIs → Network Only (nunca caché) ──────────────────────────
  if (API_ORIGINS.some(origin => request.url.includes(origin))) {
    return; // deja pasar sin respondWith → comportamiento nativo de red
  }
 
  // ── 2. CDN externos → Stale While Revalidate ─────────────────────
  if (CDN_ORIGINS.some(origin => url.hostname.includes(origin))) {
    event.respondWith(staleWhileRevalidate(request, CACHE_ASSETS));
    return;
  }
 
  // ── 3. App shell (mismo origen) → Cache First ────────────────────
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, CACHE_SHELL));
    return;
  }
 
  // ── 4. Resto → Network First con fallback a caché ─────────────────
  event.respondWith(networkFirst(request, CACHE_ASSETS));
});
 
/* ─── ESTRATEGIAS ──────────────────────────────────────────────────── */
 
/**
 * Cache First: sirve desde caché; si no está, va a red y guarda copia.
 * Ideal para el app shell (HTML, manifest).
 */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
 
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Sin red y sin caché: devuelve el index.html como fallback de SPA
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Sin conexión', { status: 503 });
  }
}
 
/**
 * Stale While Revalidate: sirve la versión cacheada (rápido)
 * y actualiza en background. Ideal para assets de CDN.
 */
async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
 
  // Lanza la petición de red en background siempre
  const networkPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
 
  return cached || await networkPromise
    || new Response('Recurso no disponible', { status: 503 });
}
 
/**
 * Network First: intenta red primero; si falla usa caché.
 * Ideal para contenido que cambia con frecuencia.
 */
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Sin conexión', { status: 503 });
  }
}
