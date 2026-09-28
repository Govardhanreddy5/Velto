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

  if (typeof window !== "undefined") {
    if (!clientInstance) {
      clientInstance = createBrowserClient(supabaseUrl, supabaseAnonKey);
    }
    return clientInstance;
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

