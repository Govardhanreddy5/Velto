// Velto Progressive Web App - Service Worker
// Cache version: v1
const CACHE_NAME = "velto-cache-v1";
const OFFLINE_URL = "/offline";

// Safe static assets to precache on install
const PRECACHE_ASSETS = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-192x192.png",
  "/icons/apple-touch-icon.png",
];

// Helper: Check if a URL or request is sensitive/dynamic and MUST NEVER be cached
function isExcludedFromCache(url, request) {
  const urlObj = new URL(url);

  // 1. External APIs (Supabase, databases, CDNs)
  if (urlObj.hostname.includes("supabase.co")) return true;

  // 2. Auth endpoints & session handling
  if (urlObj.pathname.startsWith("/auth/")) return true;
  if (urlObj.pathname.startsWith("/api/")) return true;
  if (urlObj.pathname.includes("/rest/v1")) return true;

  // 3. Trade rooms, live chats, user sensitive routes (network-first, no static cache persistence)
  if (urlObj.pathname.startsWith("/trades/")) return true;

  // 4. Any request with Auth or API headers
  if (request && request.headers) {
    if (request.headers.has("authorization")) return true;
    if (request.headers.has("apikey")) return true;
  }

  // 5. Non-HTTP(S) schemes
  if (!urlObj.protocol.startsWith("http")) return true;

  return false;
}

// Helper: Check if asset is static and safe to cache
function isStaticAsset(url) {
  const urlObj = new URL(url);
  // Next.js hashed static chunks (CSS, JS, media)
  if (urlObj.pathname.startsWith("/_next/static/")) return true;
  // App icons and static images
  if (urlObj.pathname.startsWith("/icons/")) return true;
  if (urlObj.pathname.startsWith("/images/")) return true;
  if (urlObj.pathname === "/favicon.ico") return true;
  if (urlObj.pathname === "/manifest.webmanifest" || urlObj.pathname === "/manifest.json") return true;

  return false;
}

// Install Event
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch((err) => {
        console.warn("[Velto SW] Precache error during install:", err);
      })
  );
});

// Activate Event
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((name) => {
            if (name !== CACHE_NAME) {
              return caches.delete(name);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Only GET requests should be handled; POST/PUT/DELETE must go straight to network
  if (request.method !== "GET") {
    return;
  }

  const url = request.url;

  // 1. Strictly bypass any sensitive APIs, Supabase calls, and Auth endpoints
  if (isExcludedFromCache(url, request)) {
    return; // Browser performs default network fetch
  }

  // 2. HTML Navigation requests (pages)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // If network succeeds, return page
          return response;
        })
        .catch(async () => {
          // Network failed (offline): serve the polished offline fallback page
          const cache = await caches.open(CACHE_NAME);
          const cachedOffline = await cache.match(OFFLINE_URL);
          if (cachedOffline) {
            return cachedOffline;
          }
          return new Response("You are currently offline. Please reconnect to access Velto.", {
            status: 503,
            statusText: "Service Unavailable",
            headers: { "Content-Type": "text/plain" },
          });
        })
    );
    return;
  }

  // 3. Static application assets (_next/static, icons, images)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Stale-while-revalidate for background updates
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {
              // Ignore background update errors
            });
          return cachedResponse;
        }

        // Cache miss: fetch from network and cache
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 4. Default: Network-only for all other requests
});
