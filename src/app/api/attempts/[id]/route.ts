import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/attempts/[id]">) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-attempt-token");
  if (!token) return fail("ไม่พบข้อมูลผู้สอบ", 401);
  const res = await rpc<Record<string, unknown>>("get_attempt", { p_attempt: id, p_token: token });
  return rpcError(res) ?? json(res);
}
