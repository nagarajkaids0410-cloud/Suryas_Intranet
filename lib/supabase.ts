import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://jzrlvcwqobvogbnzpnvc.supabase.co";
const DEFAULT_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6cmx2Y3dxb2J2b2dibnpwbnZjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NTA5MDY0MywiZXhwIjoyMTEwNjY2NjQzfQ.pcyK50o2nIM4joyix-f2rpGMtVjf4h561di6nl2Bye4";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  DEFAULT_SUPABASE_URL;

let clientInstance: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (clientInstance) return clientInstance;

  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_SERVICE_ROLE_KEY;

  clientInstance = createClient(supabaseUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return clientInstance;
}

export const supabase = getSupabaseAdmin();
