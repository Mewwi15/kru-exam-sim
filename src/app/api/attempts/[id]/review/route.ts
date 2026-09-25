import { db, rpc } from "@/server/db";
import { fail, json, rpcError } from "@/server/http";
import { QUESTIONS } from "@/server/questions";

type Attempt = {
  id: string;
  name: string;
  examCode: string;
  seatNo: number;
  status: string;
  score: number;
  answered: number;
  usedSec: number | null;
  durationSec: number;
  submittedAt: string | null;
  room: { code: string; title: string; status: string } | null;
  answers: Record<string, number>;
};

// เฉลยพร้อมคำอธิบาย: ให้ดูได้หลังส่งข้อสอบแล้วเท่านั้น
export async function GET(req: Request, ctx: RouteContext<"/api/attempts/[id]/review">) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-attempt-token");
  if (!token) return fail("ไม่พบข้อมูลผู้สอบ", 401);

  const res = await rpc<Attempt | { error: string }>("get_attempt", { p_attempt: id, p_token: token });
  const err = rpcError(res);
  if (err) return err;
  const attempt = res as Attempt;
  if (attempt.status !== "submitted") return fail("ยังไม่ได้ส่งข้อสอบ", 409);

  // อันดับ: นับคนที่คะแนนมากกว่า หรือคะแนนเท่ากันแต่ใช้เวลาน้อยกว่า ในกลุ่มเดียวกัน (ห้องเดียวกัน หรือกลุ่มสอบเดี่ยว)
  let scope = db().from("attempts").select("id", { count: "exact", head: true }).eq("status", "submitted");
  let total = db().from("attempts").select("id", { count: "exact", head: true }).eq("status", "submitted");
  if (attempt.room) {
    const { data: room } = await db().from("rooms").select("id").eq("code", attempt.room.code).single();
    scope = scope.eq("room_id", room!.id);
    total = total.eq("room_id", room!.id);
  } else {
    scope = scope.is("room_id", null);
    total = total.is("room_id", null);
  }
  const used = attempt.usedSec ?? attempt.durationSec;
  const [ahead, all] = await Promise.all([
    scope.or(`score.gt.${attempt.score},and(score.eq.${attempt.score},used_sec.lt.${used})`),
    total,
  ]);

  return json({
    attempt: {
      name: attempt.name,
      examCode: attempt.examCode,
      seatNo: attempt.seatNo,
      score: attempt.score,
      answered: attempt.answered,
      usedSec: attempt.usedSec,
      submittedAt: attempt.submittedAt,
      room: attempt.room,
    },
    rank: (ahead.count ?? 0) + 1,
    participants: all.count ?? 0,
    answers: attempt.answers,
    questions: QUESTIONS,
  });
}
