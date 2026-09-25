import "server-only";
import { secretKey, supabaseUrl } from "./db";

export type BroadcastMessage = { topic: string; event: string; payload: unknown };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ส่งข้อความผ่าน Supabase Realtime (Broadcast) ด้วย REST API
// เบราว์เซอร์ใช้ข้อความเหล่านี้เป็นแค่ "สัญญาณ" ข้อมูลจริงอยู่ในฐานข้อมูลเสมอ
// ถ้าโดนจำกัดจำนวนข้อความ (429) และเป็นเหตุการณ์สำคัญ จะลองส่งใหม่อีกไม่กี่ครั้ง
export async function broadcast(messages: BroadcastMessage[], { retries = 0 } = {}): Promise<void> {
  if (messages.length === 0) return;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${supabaseUrl()}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: secretKey(), "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages.map((m) => ({ ...m, private: false })) }),
      });
      if (res.ok) return;
      if (res.status !== 429 || attempt === retries) {
        console.error("broadcast failed", res.status, await res.text());
        return;
      }
    } catch (err) {
      if (attempt === retries) {
        console.error("broadcast error", err);
        return;
      }
    }
    await sleep(400 * (attempt + 1) + Math.random() * 400);
  }
}

export const roomTopic = (code: string) => `room:${code}`;
export const proctorTopic = (teacherChannel: string) => `proctor:${teacherChannel}`;
