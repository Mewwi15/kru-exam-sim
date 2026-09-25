import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";
import { broadcast, roomTopic } from "@/server/broadcast";

type StartResult = { status: string; startedAt: string; deadline: string; serverNow: string };

// ครูกดเริ่ม: บันทึกเวลาเริ่มที่ฐานข้อมูล แล้วส่งสัญญาณให้ทุกคนในห้องพร้อมกัน
export async function POST(req: Request, ctx: RouteContext<"/api/rooms/[code]/start">) {
  const { code } = await ctx.params;
  const token = req.headers.get("x-teacher-token");
  if (!token) return fail("ไม่มีสิทธิ์จัดการห้องสอบนี้", 401);

  const res = await rpc<StartResult | { error: string }>("start_room", { p_code: code, p_token: token });
  const err = rpcError(res);
  if (err) return err;
  const started = res as StartResult;
  // รอให้ส่งสัญญาณเสร็จก่อนตอบครู เพื่อให้นักเรียนเริ่มใกล้เคียงกับที่ครูเห็นมากที่สุด
  await broadcast(
    [{ topic: roomTopic(code), event: "start", payload: { startedAt: started.startedAt, deadline: started.deadline } }],
    { retries: 3 },
  );
  return json(started);
}
