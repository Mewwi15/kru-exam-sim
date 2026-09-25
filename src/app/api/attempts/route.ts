import { after } from "next/server";
import { DEFAULT_DURATION_MIN } from "@/lib/exam-meta";
import { rpc } from "@/server/db";
import { examCode, secretToken } from "@/server/ids";
import { fail, json, readJson, rpcError } from "@/server/http";
import { broadcast, proctorTopic } from "@/server/broadcast";

type Body = { name?: string; roomCode?: string };

type JoinResult = {
  id: string;
  examCode: string;
  seatNo: number;
  status: string;
  name: string;
  teacherChannel: string;
};

// สร้างการสอบใหม่: ไม่มี roomCode = สอบเดี่ยว, มี roomCode = เข้าห้องที่มีครูคุมสอบ
export async function POST(req: Request) {
  const body = await readJson<Body>(req);
  const name = body?.name?.trim().replace(/\s+/g, " ") ?? "";
  if (name.length < 1 || name.length > 60) return fail("กรุณากรอกชื่อ (ไม่เกิน 60 ตัวอักษร)");

  const token = secretToken();
  const roomCode = body?.roomCode?.trim();

  if (!roomCode) {
    const res = await rpc<{ id: string; examCode: string }>("create_solo_attempt", {
      p_name: name,
      p_exam_code: examCode(),
      p_token: token,
      p_duration_sec: DEFAULT_DURATION_MIN * 60,
    });
    return json({ attemptId: res.id, token, examCode: res.examCode, seatNo: 0 });
  }

  if (!/^\d{6}$/.test(roomCode)) return fail("รหัสห้องต้องเป็นตัวเลข 6 หลัก");

  // รหัสผู้สอบสุ่ม 5 ตัว ชนกันได้ยากมาก แต่ถ้าชนก็สุ่มใหม่
  for (let i = 0; i < 3; i++) {
    try {
      const res = await rpc<JoinResult | { error: string }>("join_room", {
        p_code: roomCode,
        p_name: name,
        p_exam_code: examCode(),
        p_token: token,
      });
      const err = rpcError(res);
      if (err) return err;
      const joined = res as JoinResult;
      after(() =>
        broadcast([
          {
            topic: proctorTopic(joined.teacherChannel),
            event: "join",
            payload: {
              id: joined.id,
              name: joined.name,
              seatNo: joined.seatNo,
              examCode: joined.examCode,
              status: joined.status,
            },
          },
        ], { retries: 3 }),
      );
      return json({ attemptId: joined.id, token, examCode: joined.examCode, seatNo: joined.seatNo });
    } catch (e) {
      if (!String(e).includes("attempts_room_exam_code_idx")) throw e;
    }
  }
  return fail("เข้าห้องไม่สำเร็จ ลองอีกครั้ง", 500);
}
