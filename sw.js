// === SERVICE WORKER — App Shell Cache ===
// Caches static assets for offline/instant load. Never caches user data.

var CACHE_NAME = 'fi-shell-v33';

var SHELL_ASSETS = [
  './',
  './index.html',
  './admin.html',
  './css/styles.css',
  './css/admin.css',
  './js/lib/utils.js',
  './js/lib/date-utils.js',
  './js/data/account-service.js',
  './js/data/data-service.js',
  './js/data/returns-calc.js',
  './js/data/networth-calc.js',
  './js/data/fi-calc.js',
  './js/data/goals-calc.js',
  './js/data/budget-calc.js',
  './js/data/milestone-calc.js',
  './js/data/mortgage-calc.js',
  './js/data/summary-calc.js',
  './js/data/anomaly-calc.js',
  './js/data/emergency-calc.js',
  './js/data/goal-accounting-service.js',
  './js/data/goal-allocation-service.js',
  './js/data/goal-rules-service.js',
  './js/data/cashflow-taxonomy-service.js',
  './js/data/cashflow-normalization-service.js',
  './js/data/cashflow-calc.js',
  './js/data/savings-capacity-calc.js',
  './js/data/goal-planner-calc.js',
  './js/data/actions-calc.js',
  './js/ui/ui-metrics.js',
  './js/ui/ui-charts.js',
  './js/ui/ui-tables.js',
  './js/ui/ui-goals.js',
  './js/ui/ui-budget.js',
  './js/ui/ui-mortgage.js',
  './js/ui/ui-summary.js',
  './js/ui/ui-emergency.js',
  './js/ui/ui-cashflow.js',
  './js/ui/ui-planner.js',
  './js/ui/ui-home.js',
  './js/ui/ui-whatif.js',
  './js/crypto.js',
  './js/db-crypto.js',
  './js/db-service.js',
  './js/storage-manager.js',
  './js/config.js',
  './js/data-export.js',
  './js/file-manager.js',
  './js/data-cache.js',
  './js/app.js',
  './js/admin.js',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

var CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js'
];

// Install: pre-cache app shell + CDN
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_ASSETS.concat(CDN_ASSETS));
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// Activate: delete old caches
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// Fetch: cache-first for local, stale-while-revalidate for CDN
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  // Supabase API: always network (never cache API calls)
  if (url.hostname.endsWith('.supabase.co')) return;

  // CDN: stale-while-revalidate
  if (url.origin !== self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function(cached) {
        var fetchPromise = fetch(event.request).then(function(response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(function() {
          return cached;
        });
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Local: cache-first
  event.respondWith(
    caches.match(event.request).then(function(cached) {
      return cached || fetch(event.request);
    })
  );
});
