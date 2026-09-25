import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/rooms/[code]/snapshot">) {
  const { code } = await ctx.params;
  const token = req.headers.get("x-teacher-token");
  if (!token) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 401);
  const res = await rpc<Record<string, unknown>>("proctor_snapshot", { p_code: code, p_token: token });
  return rpcError(res) ?? json(res);
}
