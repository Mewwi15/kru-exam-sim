import { connection } from "next/server";
import Landing from "@/components/Landing";
import type { BoardRow } from "@/components/Leaderboard";
import { rpc } from "@/server/db";

export default async function Home() {
  await connection();
  const board = await rpc<BoardRow[]>("leaderboard", { p_code: null, p_limit: 10 }).catch(() => []);
  return <Landing board={board} />;
}
