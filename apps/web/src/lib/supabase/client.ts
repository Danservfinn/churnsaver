import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseBrowserInstance: SupabaseClient | null = null;

// Lazily initialize the Supabase browser client to avoid build-time errors
function getSupabaseBrowser(): SupabaseClient {
  if (supabaseBrowserInstance) {
    return supabaseBrowserInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables'
    );
  }

  supabaseBrowserInstance = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: true },
  });

  return supabaseBrowserInstance;
}

// Export as a getter to enable lazy initialization
export const supabaseBrowser = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseBrowser() as any)[prop];
  },
});
