import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// เบราว์เซอร์ใช้ Supabase เฉพาะ Realtime (รับสัญญาณเริ่ม/จบ และสถานะออนไลน์)
// ข้อมูลทั้งหมดอ่านเขียนผ่าน API ของเว็บเท่านั้น
let client: SupabaseClient | null = null;

export function realtime(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        realtime: { params: { eventsPerSecond: 50 } },
      },
    );
  }
  return client;
}

export const roomTopic = (code: string) => `room:${code}`;
export const proctorTopic = (teacherChannel: string) => `proctor:${teacherChannel}`;
