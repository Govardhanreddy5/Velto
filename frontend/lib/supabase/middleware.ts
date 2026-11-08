import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, {
            ...options,
            maxAge: options?.maxAge ?? 60 * 60 * 24 * 30, // 30-day persistent cookie
            sameSite: options?.sameSite ?? "lax",
            path: options?.path ?? "/",
            secure: process.env.NODE_ENV === "production",
          })
        );
      },
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  });

  // IMPORTANT: auth.getUser() refreshes expired access tokens using the refresh token
  // and triggers setAll to write updated Set-Cookie headers onto supabaseResponse.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtectedRoute =
    path.startsWith("/dashboard") ||
    path.startsWith("/feed") ||
    path.startsWith("/profile") ||
    path.startsWith("/trades") ||
    path.startsWith("/requests") ||
    path.startsWith("/onboarding");

  // Check if an auth cookie existed in the request (user had an active session that expired)
  const hasAuthCookie = request.cookies.getAll().some((c) =>
    c.name.includes("-auth-token")
  );

  if (!user && isProtectedRoute && hasAuthCookie) {
    const redirectUrl = new URL("/auth?mode=signin&reason=session_expired", request.url);
    const redirectResponse = NextResponse.redirect(redirectUrl);
    // Forward any cookie updates/clearances to the browser
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie);
    });
    return redirectResponse;
  }

  return supabaseResponse;
}
