import { createClient } from '@supabase/supabase-js';
import { api } from '#lib/api.js';

let clientPromise = null;

export async function getSupabase() {
  if (!clientPromise) {
    clientPromise = api('/auth/config').then((config) =>
      createClient(config.supabase_url, config.supabase_anon_key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'pkce'
        }
      })
    );
  }
  return clientPromise;
}

export async function signInWithGoogle() {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  });
  if (error) throw error;
}
