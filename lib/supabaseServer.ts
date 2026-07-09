import { createClient } from '@supabase/supabase-js';

// Server-only Supabase client — used inside API routes.
// Uses the SERVICE ROLE key which bypasses RLS, so every query here
// must manually filter by the authenticated user's id. Never import
// this file into a client component.
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

// Verifies the bearer token sent from the client and returns the user id.
// Every API route that touches user data should call this first.
export async function getUserFromRequest(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const supa = supabaseServer();
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
