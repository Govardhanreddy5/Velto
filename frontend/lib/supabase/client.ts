import { createBrowserClient } from "@supabase/ssr";

/**
 * Creates a Supabase client for use in browser / client components.
 * Returns null if Supabase environment variables are not yet configured.
 */
let clientInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const clientConfig = {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: "pkce" as const,
    },
    cookieOptions: {
      maxAge: 60 * 60 * 24 * 30, // 30-day persistent cookie
      sameSite: "lax" as const,
      path: "/",
      secure: process.env.NODE_ENV === "production",
    },
  };

  if (typeof window !== "undefined") {
    if (!clientInstance) {
      clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey, clientConfig);
    }
    return clientInstance;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, clientConfig);
}

