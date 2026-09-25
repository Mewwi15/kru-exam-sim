import { after } from "next/server";
import { rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";
import { broadcast, proctorTopic } from "@/server/broadcast";

type SubmitResult = {
  id: string;
  status: string;
  score: number;
  answered: number;
  usedSec: number | null;
  name: string;
  seatNo: number;
  teacherChannel: string | null;
};

export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/submit">) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-attempt-token");
  if (!token) return fail("ไม่พบข้อมูลผู้สอบ", 401);

  const res = await rpc<SubmitResult | { error: string }>("submit_attempt", { p_attempt: id, p_token: token });
  const err = rpcError(res);
  if (err) return err;

  const done = res as SubmitResult;
  if (done.teacherChannel) {
    const channel = done.teacherChannel;
    after(() =>
      broadcast([
        {
          topic: proctorTopic(channel),
          event: "submit",
          payload: { id, status: done.status, score: done.score, answered: done.answered, usedSec: done.usedSec },
        },
      ], { retries: 3 }),
    );
  }
  return json({ status: done.status, score: done.score, answered: done.answered, usedSec: done.usedSec });
}
