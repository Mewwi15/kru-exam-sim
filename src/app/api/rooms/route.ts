import { DEFAULT_DURATION_MIN } from "@/lib/exam-meta";
import { db } from "@/server/db";
import { roomCode, secretToken } from "@/server/ids";
import { fail, json, readJson } from "@/server/http";

// ครูสร้างห้องสอบ ได้รหัสห้อง 6 หลักไว้แจกนักเรียน และ teacherToken ไว้คุมห้อง
export async function POST(req: Request) {
  const body = await readJson<{ title?: string; durationMin?: number }>(req);
  const title = body?.title?.trim() || "ห้องสอบจำลอง วิชาครู";
  const durationMin = Math.round(Number(body?.durationMin ?? DEFAULT_DURATION_MIN));
  if (title.length > 80) return fail("ชื่อห้องยาวเกินไป");
  if (!Number.isFinite(durationMin) || durationMin < 1 || durationMin > 360) return fail("เวลาสอบต้องอยู่ระหว่าง 1–360 นาที");

  const teacherToken = secretToken();
  for (let i = 0; i < 5; i++) {
    const code = roomCode();
    const { error } = await db().from("rooms").insert({
      code,
      title,
      teacher_token: teacherToken,
      teacher_channel: secretToken(),
      duration_sec: durationMin * 60,
    });
    if (!error) return json({ code, teacherToken, title });
    if (error.code !== "23505") throw new Error(error.message);
  }
  return fail("สร้างห้องไม่สำเร็จ ลองอีกครั้ง", 500);
}
