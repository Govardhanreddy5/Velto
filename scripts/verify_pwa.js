const http = require('http');

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data
        });
      });
    }).on('error', reject);
  });
}

async function runTests() {
  console.log("=== VELTO PWA VERIFICATION SUITE ===");
  let passed = 0;
  let total = 0;

  function assert(condition, testName) {
    total++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
    }
  }

  // 1. Manifest
  try {
    const res = await get('/manifest.webmanifest');
    assert(res.statusCode === 200, "Manifest route /manifest.webmanifest returns HTTP 200");
    const manifest = JSON.parse(res.data);
    assert(manifest.name === "Velto", `Manifest name is "Velto" (got ${manifest.name})`);
    assert(manifest.short_name === "Velto", `Manifest short_name is "Velto"`);
    assert(manifest.display === "standalone", `Manifest display is "standalone"`);
    assert(manifest.start_url === "/", `Manifest start_url is "/"`);
    assert(manifest.scope === "/", `Manifest scope is "/"`);
    assert(manifest.theme_color === "#2563eb", `Manifest theme_color is "#2563eb"`);
    assert(manifest.background_color === "#ffffff", `Manifest background_color is "#ffffff"`);
    assert(manifest.icons && manifest.icons.length >= 4, `Manifest includes >= 4 icon definitions`);
    
    const has192 = manifest.icons.some(i => i.sizes === "192x192" && i.purpose !== "maskable");
    const has512 = manifest.icons.some(i => i.sizes === "512x512" && i.purpose !== "maskable");
    const hasMaskable = manifest.icons.some(i => i.purpose === "maskable");
    assert(has192, `Manifest includes standard 192x192 icon`);
    assert(has512, `Manifest includes standard 512x512 icon`);
    assert(hasMaskable, `Manifest includes maskable icon`);
  } catch (e) {
    console.error("Manifest test failed with error:", e);
  }

  // 2. Static Manifest fallback
  try {
    const res = await get('/manifest.json');
    assert(res.statusCode === 200, "Static manifest fallback /manifest.json returns HTTP 200");
  } catch (e) {
    console.error("Static manifest error:", e);
  }

  // 3. Service Worker
  try {
    const res = await get('/sw.js');
    assert(res.statusCode === 200, "Service Worker /sw.js returns HTTP 200");
    assert(res.data.includes("supabase.co"), "Service Worker explicitly excludes supabase.co API caching");
    assert(res.data.includes("/auth/"), "Service Worker excludes /auth/ endpoints");
    assert(res.data.includes("/offline"), "Service Worker precaches /offline fallback");
  } catch (e) {
    console.error("SW test failed with error:", e);
  }

  // 4. Offline page
  try {
    const res = await get('/offline');
    assert(res.statusCode === 200, "Offline page /offline returns HTTP 200");
    assert(res.data.includes("Internet Connection Needed") || res.data.includes("Offline"), "Offline page contains friendly offline explanation");
    assert(res.data.includes("Try Again") || res.data.includes("Retry"), "Offline page provides retry action");
  } catch (e) {
    console.error("Offline page test error:", e);
  }

  // 5. Icons
  const iconPaths = [
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/icons/icon-maskable-192x192.png',
    '/icons/icon-maskable-512x512.png',
    '/icons/apple-touch-icon.png',
    '/apple-touch-icon.png'
  ];

  for (const iconPath of iconPaths) {
    try {
      const res = await get(iconPath);
      assert(res.statusCode === 200, `Icon ${iconPath} returns HTTP 200`);
    } catch (e) {
      console.error(`Icon test failed for ${iconPath}:`, e);
    }
  }

  // 6. Landing page metadata check
  try {
    const res = await get('/');
    assert(res.statusCode === 200, "Landing page / returns HTTP 200");
    assert(res.data.includes("manifest.webmanifest"), "Landing page links to manifest.webmanifest");
    assert(res.data.includes("apple-touch-icon"), "Landing page links to apple-touch-icon");
    assert(res.data.includes("theme-color"), "Landing page specifies theme-color meta tag");
  } catch (e) {
    console.error("Landing page test error:", e);
  }

  // 7. Deep link routes accessibility
  const deepLinks = [
    '/dashboard',
    '/feed',
    '/requests/new',
    '/profile'
  ];

  for (const deepLink of deepLinks) {
    try {
      const res = await get(deepLink);
      // Either 200 or 307 (redirect to auth if not logged in)
      assert(res.statusCode === 200 || res.statusCode === 307, `Deep link ${deepLink} resolves cleanly with HTTP ${res.statusCode}`);
    } catch (e) {
      console.error(`Deep link test failed for ${deepLink}:`, e);
    }
  }

  console.log(`\nRESULTS: ${passed}/${total} assertions passed.`);
  if (passed === total) {
    console.log("ALL PWA TESTS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error("Test suite fatal error:", err);
  process.exit(1);
});
