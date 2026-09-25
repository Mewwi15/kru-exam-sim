import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";
import { broadcast, roomTopic } from "@/server/broadcast";

type EndResult = { status: string; submitted: { id: string; score: number; answered: number; usedSec: number }[] };

// ครูกดจบการสอบ: เก็บกระดาษคำตอบทุกคน แล้วแจ้งทุกเครื่องให้ไปหน้าผลสอบ
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/end">) {
  const { code } = await ctx.params;
  const token = req.headers.get("x-teacher-token");
  if (!token) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 401);

  const res = await rpc<EndResult | { error: string }>("end_room", { p_code: code, p_token: token });
  const err = rpcError(res);
  if (err) return err;
  await broadcast([{ topic: roomTopic(code), event: "end", payload: {} }], { retries: 3 });
  return json(res);
}
