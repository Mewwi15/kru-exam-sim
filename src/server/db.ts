import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

export function secretKey(): string {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!key) throw new Error("ยังไม่ได้ตั้งค่า SUPABASE_SECRET_KEY");
  return key;
}

// ใช้ client เดียวตลอดอายุของ process เพื่อให้ connection ถูกใช้ซ้ำ (keep-alive)
export function db(): SupabaseClient {
  if (!client) {
    client = createClient(supabaseUrl(), secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}
