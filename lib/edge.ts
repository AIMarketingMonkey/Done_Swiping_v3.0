import { supabase } from './supabase';

/**
 * Call a Supabase Edge Function with the signed-in user's JWT attached
 * automatically (supabase-js adds the Authorization header from the session).
 *
 * Throws on a non-2xx response so callers can show an inline error.
 */
export async function callEdge<T = unknown>(name: string, body?: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body ?? {},
  });
  if (error) throw error;
  return data as T;
}
