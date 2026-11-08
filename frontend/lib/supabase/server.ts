import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Creates a Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Returns null if Supabase environment variables are not yet configured.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              maxAge: options?.maxAge ?? 60 * 60 * 24 * 30, // 30-day persistent cookie
              sameSite: options?.sameSite ?? "lax",
              path: options?.path ?? "/",
              secure: process.env.NODE_ENV === "production",
            })
          );
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored because middleware refreshes user sessions.
        }
      },
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30, // 30 days
      sameSite: "lax",
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  });
}
