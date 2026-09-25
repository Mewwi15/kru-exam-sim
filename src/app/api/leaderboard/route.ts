import type { NextRequest } from "next/server";
import { rpc } from "@/server/db";
import { json } from "@/server/http";

// ?room=123456 = อันดับในห้อง, ไม่ระบุ = อันดับสอบเดี่ยว
export async function GET(req: NextRequest) {
  const room = req.nextUrl.searchParams.get("room");
  const limit = Math.min(100, Number(req.nextUrl.searchParams.get("limit")) || 20);
  const rows = await rpc<unknown[]>("leaderboard", {
    p_code: room && /^\d{6}$/.test(room) ? room : null,
    p_limit: limit,
  });
  return json({ rows });
}
