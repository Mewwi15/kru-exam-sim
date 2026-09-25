import { db } from "@/server/db";
import { fail, json, readJson } from "@/server/http";

// กลับเข้าห้องสอบจากเครื่องอื่นด้วย รหัสห้อง + รหัสผู้สอบ
export async function POST(req: Request) {
  const body = await readJson<{ roomCode?: string; examCode?: string }>(req);
  const roomCode = body?.roomCode?.trim() ?? "";
  const code = body?.examCode?.trim().toUpperCase() ?? "";
  if (!/^\d{6}$/.test(roomCode) || !/^[A-Z0-9]{5}$/.test(code)) {
    return fail("กรอกรหัสห้อง 6 หลัก และรหัสผู้สอบ 5 ตัวให้ถูกต้อง");
  }
  const { data, error } = await db()
    .from("attempts")
    .select("id, token, rooms!inner(code)")
    .eq("exam_code", code)
    .eq("rooms.code", roomCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return fail("ไม่พบผู้สอบ ตรวจสอบรหัสอีกครั้ง", 404);
  return json({ attemptId: data.id, token: data.token });
}
