const CACHE = "nyc-trip-v55"

const SHELL = [
  "./",
  "./index.html",
  "./layout.css",
  "./app.js",
  "./data.json",
  "./manifest.json",
  "./subway-map.svg"
]

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  )
  self.skipWaiting()
})

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", e => {
  const url = e.request.url

  // Network-first for weather API (cache as fallback)
  if (url.includes("open-meteo.com")) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return r
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Network-first for Google Fonts (cache for offline)
  if (url.includes("fonts.googleapis.com") || url.includes("fonts.gstatic.com")) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return r
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Network-first for data.json (trip data may change between deploys)
  if (url.includes("data.json")) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          const clone = r.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return r
        })
        .catch(() => caches.match(e.request))
    )
    return
  }

  // Cache-first for app shell
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  )
})
