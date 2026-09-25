import { after } from "next/server";
import { rpc } from "@/server/db";
import { fail, json, readJson, rpcError } from "@/server/http";
import { isCorrect, isValidQuestion } from "@/server/questions";
import { broadcast, proctorTopic } from "@/server/broadcast";

type Item = { q: number; choice: number | null };
type SaveResult = { score: number; answered: number; serverNow: string; teacherChannel: string | null };

// บันทึกคำตอบ ส่งมาได้หลายข้อในครั้งเดียว (ฝั่งผู้สอบรวมคำตอบที่ค้างแล้วส่งทีเดียว)
export async function POST(req: Request, ctx: RouteContext<"/api/attempts/[id]/answers">) {
  const { id } = await ctx.params;
  const token = req.headers.get("x-attempt-token");
  if (!token) return fail("ไม่พบข้อมูลผู้สอบ", 401);

  const body = await readJson<{ items?: Item[] }>(req);
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) return fail("ข้อมูลคำตอบไม่ถูกต้อง");

  const graded: { q: number; choice: number | null; correct: boolean }[] = [];
  for (const it of items) {
    const q = Number(it?.q);
    const choice = it?.choice === null ? null : Number(it?.choice);
    if (!isValidQuestion(q)) return fail(`ไม่มีข้อ ${it?.q}`);
    if (choice !== null && !(Number.isInteger(choice) && choice >= 0 && choice <= 4)) return fail("ตัวเลือกไม่ถูกต้อง");
    graded.push({ q, choice, correct: choice !== null && isCorrect(q, choice) });
  }

  const res = await rpc<SaveResult | { error: string }>("save_answers", {
    p_attempt: id,
    p_token: token,
    p_items: graded,
  });
  const err = rpcError(res);
  if (err) return err;

  const saved = res as SaveResult;
  if (saved.teacherChannel) {
    const channel = saved.teacherChannel;
    // แจ้งครูคุมสอบหลังตอบกลับผู้สอบแล้ว ผู้สอบจึงไม่ต้องรอ
    after(() =>
      broadcast([
        {
          topic: proctorTopic(channel),
          event: "answer",
          payload: {
            id,
            items: graded.map((g) => [g.q, g.choice, g.correct]),
            score: saved.score,
            answered: saved.answered,
          },
        },
      ]),
    );
  }
  return json({ answered: saved.answered, serverNow: saved.serverNow });
}
