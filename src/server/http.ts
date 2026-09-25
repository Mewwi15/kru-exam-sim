import "server-only";
import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(message: string, status = 400) {
  return json({ error: message }, status);
}

const ERROR_TEXT: Record<string, [string, number]> = {
  not_found: ["ไม่พบข้อมูลผู้สอบ", 404],
  forbidden: ["ไม่มีสิทธิ์จัดการห้องสอบนี้", 403],
  room_not_found: ["ไม่พบห้องสอบ ตรวจสอบรหัสห้องอีกครั้ง", 404],
  room_ended: ["ห้องสอบนี้ปิดแล้ว", 409],
  not_running: ["ยังไม่ถึงเวลาสอบ หรือส่งข้อสอบไปแล้ว", 409],
  time_up: ["หมดเวลาสอบแล้ว", 409],
};

// แปลง error code ที่ฟังก์ชันในฐานข้อมูลส่งกลับมาเป็นข้อความภาษาไทย
export function rpcError(result: unknown) {
  const code = (result as { error?: string } | null)?.error;
  if (!code) return null;
  const [message, status] = ERROR_TEXT[code] ?? ["เกิดข้อผิดพลาด", 400];
  return json({ error: message, code, status: (result as { status?: string }).status }, status);
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
