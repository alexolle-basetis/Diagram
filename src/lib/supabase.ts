import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * True when both VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.
 * When false, the app runs in local-only mode (localStorage, no auth).
 */
export const isSupabaseConfigured = !!(url && key);

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, key!)
  : (null as unknown as SupabaseClient); // never used in local mode

export interface DiagramRow {
  id: string;
  name: string;
  data: unknown;
  positions: unknown;
  owner_id: string;
  updated_at: string;
  created_at: string;
}
