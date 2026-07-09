import { createClient } from '@supabase/supabase-js';

// Client-side Supabase instance — safe to use in browser components.
// Uses the anon key, protected by Row Level Security policies in supabase/schema.sql
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
