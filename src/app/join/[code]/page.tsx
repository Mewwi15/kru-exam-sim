import { connection } from "next/server";
import Landing from "@/components/Landing";
import type { BoardRow } from "@/components/Leaderboard";
import { rpc } from "@/server/db";

// ลิงก์/QR ที่ครูแจก: เปิดหน้าแรกในโหมด "เข้าห้องสอบ" พร้อมกรอกรหัสห้องให้แล้ว
export default async function JoinPage({ params }: PageProps<"/join/[code]">) {
  await connection();
  const { code } = await params;
  const board = await rpc<BoardRow[]>("leaderboard", { p_code: null, p_limit: 10 }).catch(() => []);
  return <Landing board={board} initialRoom={/^\d{6}$/.test(code) ? code : undefined} />;
}
