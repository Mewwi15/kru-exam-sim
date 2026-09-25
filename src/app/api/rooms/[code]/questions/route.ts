import { db } from "@/server/db";
import { fail, json } from "@/server/http";
import { QUESTIONS } from "@/server/questions";

// ข้อสอบพร้อมเฉลยสำหรับครูคุมสอบ (ต้องมี teacher token ของห้องนี้)
export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]/questions">) {
  const { code } = await ctx.params;
  const token = req.headers.get("x-teacher-token");
  if (!token) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 401);
  const { data } = await db().from("rooms").select("id").eq("code", code).eq("teacher_token", token).maybeSingle();
  if (!data) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 403);
  return json({ questions: QUESTIONS });
}
