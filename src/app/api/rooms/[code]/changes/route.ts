import type { NextRequest } from "next/server";
import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";

// เฉพาะข้อมูลที่เปลี่ยนตั้งแต่ ?since= (เวลา server) — ทางสำรองของหน้าครูเมื่อข้อความ realtime หลุด
export async function GET(req: NextRequest, ctx: RouteContext<"/api/rooms/[code]/changes">) {
  const { code } = await ctx.params;
  const token = req.headers.get("x-teacher-token");
  if (!token) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 401);
  const since = new Date(req.nextUrl.searchParams.get("since") ?? "");
  if (Number.isNaN(since.getTime())) return fail("since ไม่ถูกต้อง");
  const res = await rpc<Record<string, unknown>>("proctor_changes", {
    p_code: code,
    p_token: token,
    p_since: since.toISOString(),
  });
  return rpcError(res) ?? json(res);
}
