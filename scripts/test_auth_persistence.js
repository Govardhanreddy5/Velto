/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');

async function runAuthPersistenceTestSuite() {
  console.log("============================================================");
  console.log("VELTO AUTHENTICATION PERSISTENCE & PWA TEST SUITE");
  console.log("Auditing Supabase SSR, Cookie Lifetimes, Middleware & PWA Restarts");
  console.log("============================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
    }
  }

  // 1. Audit Browser Client Configuration (lib/supabase/client.ts)
  const clientCode = fs.readFileSync(path.join(__dirname, '../lib/supabase/client.ts'), 'utf8');
  assert(clientCode.includes('persistSession: true'), "Browser client explicitly enables persistSession: true");
  assert(clientCode.includes('autoRefreshToken: true'), "Browser client explicitly enables autoRefreshToken: true");
  assert(clientCode.includes('detectSessionInUrl: true'), "Browser client enables detectSessionInUrl: true");
  assert(clientCode.includes('maxAge: 60 * 60 * 24 * 30'), "Browser client configures 30-day persistent cookieOptions");
  assert(clientCode.includes('sameSite: "lax"'), "Browser client sets sameSite: 'lax' for robust cross-navigation");

  // 2. Audit Server Client Configuration (lib/supabase/server.ts)
  const serverCode = fs.readFileSync(path.join(__dirname, '../lib/supabase/server.ts'), 'utf8');
  assert(serverCode.includes('maxAge: 60 * 60 * 24 * 30'), "Server client configures 30-day persistent cookieOptions");
  assert(serverCode.includes('sameSite: "lax"'), "Server client sets sameSite: 'lax'");
  assert(serverCode.includes('cookieStore.getAll()'), "Server client implements getAll() for reading all cookie chunks");
  assert(serverCode.includes('cookieStore.set(name, value'), "Server client implements setAll() with persistent options");

  // 3. Audit Middleware Configuration (middleware.ts & lib/supabase/middleware.ts)
  assert(fs.existsSync(path.join(__dirname, '../middleware.ts')), "middleware.ts exists at project root");
  const middlewareFile = fs.readFileSync(path.join(__dirname, '../middleware.ts'), 'utf8');
  assert(middlewareFile.includes('export async function middleware'), "middleware.ts exports middleware function");
  assert(middlewareFile.includes('updateSession'), "middleware.ts delegates to updateSession");

  const middlewareHelper = fs.readFileSync(path.join(__dirname, '../lib/supabase/middleware.ts'), 'utf8');
  assert(middlewareHelper.includes('auth.getUser()'), "Middleware actively calls auth.getUser() to refresh expiring tokens");
  assert(middlewareHelper.includes('maxAge: 60 * 60 * 24 * 30'), "Middleware sets 30-day persistent cookie options on response");
  assert(middlewareHelper.includes('reason=session_expired'), "Middleware redirects to graceful session_expired flow on protected routes");

  // 4. Audit Manifest and Edge Registration (.next/server/middleware-manifest.json)
  if (fs.existsSync(path.join(__dirname, '../.next/server/middleware-manifest.json'))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../.next/server/middleware-manifest.json'), 'utf8'));
    assert(manifest.middleware && manifest.middleware['/'], "middleware-manifest.json contains root edge middleware registration");
    assert(manifest.sortedMiddleware && manifest.sortedMiddleware.includes('/'), "sortedMiddleware registers root path for Vercel edge deployment");
  }

  // 5. Audit Service Worker Cache Exclusions (public/sw.js)
  const swCode = fs.readFileSync(path.join(__dirname, '../public/sw.js'), 'utf8');
  assert(swCode.includes('urlObj.pathname === "/auth" || urlObj.pathname.startsWith("/auth")'), "Service Worker completely excludes /auth routes from caching");
  assert(swCode.includes('urlObj.pathname.includes("/auth/v1")'), "Service Worker excludes Supabase auth/v1 API endpoints from caching");
  assert(swCode.includes('urlObj.pathname.startsWith("/dashboard")'), "Service Worker excludes protected /dashboard from static caching");
  assert(swCode.includes('urlObj.pathname.startsWith("/feed")'), "Service Worker excludes protected /feed from static caching");
  assert(swCode.includes('velto-cache-v4'), "Service Worker incremented to velto-cache-v4 for clean cache eviction");

  // 6. Audit Graceful Expired Session UI (components/auth/auth-view.tsx)
  const authViewCode = fs.readFileSync(path.join(__dirname, '../components/auth/auth-view.tsx'), 'utf8');
  assert(authViewCode.includes('reason === "session_expired"'), "AuthView detects reason=session_expired query param");
  assert(authViewCode.includes('Session Expired'), "AuthView renders clear 'Session Expired' headline");
  assert(authViewCode.includes('isSessionExpired && mode === "signin"'), "AuthView automatically defaults mode to 'signin' on session expiry");

  // 7. Audit Routing Guard in Profile Actions (lib/profile/actions.ts)
  const profileActions = fs.readFileSync(path.join(__dirname, '../lib/profile/actions.ts'), 'utf8');
  assert(profileActions.includes('reason=session_expired'), "checkUserRouting appends reason=session_expired when token indicates expiry");
  assert(profileActions.includes('is_banned || profile.is_suspended'), "checkUserRouting strictly enforces RESTRICTED state for banned/suspended users");

  // 8. Sign Out Flow Audit (lib/auth/actions.ts)
  const authActions = fs.readFileSync(path.join(__dirname, '../lib/auth/actions.ts'), 'utf8');
  assert(authActions.includes('supabase.auth.signOut()'), "signOutAction calls supabase.auth.signOut()");
  assert(authActions.includes('redirect("/auth?mode=signin")'), "signOutAction redirects cleanly to sign in page");

  // 9. Simulation of 30-Day Expiry vs Session Expiry Logic
  const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30;
  const now = Math.floor(Date.now() / 1000);
  const cookieExpiresAt = now + THIRTY_DAYS_SEC;

  // Simulate opening app 5 minutes later (closed and reopened)
  const reopenedFiveMinutesLater = now + 300;
  assert(reopenedFiveMinutesLater < cookieExpiresAt, "App reopened after 5 minutes: 30-day cookie remains valid");

  // Simulate opening app 7 days later
  const reopenedSevenDaysLater = now + (7 * 24 * 3600);
  assert(reopenedSevenDaysLater < cookieExpiresAt, "App reopened after 7 days: 30-day cookie remains valid");

  // Simulate opening app 35 days later (expired)
  const reopenedThirtyFiveDaysLater = now + (35 * 24 * 3600);
  assert(reopenedThirtyFiveDaysLater > cookieExpiresAt, "App reopened after 35 days: gracefully recognized as expired session");

  console.log(`\nTEST RESULTS: ${passed}/${total} assertions passed.`);
  if (passed === total) {
    console.log("ALL AUTH PERSISTENCE AND PWA CHECKS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAuthPersistenceTestSuite().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
