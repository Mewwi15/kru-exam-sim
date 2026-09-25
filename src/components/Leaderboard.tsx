"use client";

import { Empty, Table, Tag } from "antd";
import { TrophyFilled } from "@ant-design/icons";
import { PASS_PERCENT, TOTAL_QUESTIONS, formatUsed } from "@/lib/exam-meta";

export type BoardRow = {
  id: string;
  name: string;
  score: number;
  answered: number;
  usedSec: number | null;
  submittedAt: string | null;
  seatNo?: number;
};

const MEDAL = ["text-amber-400", "text-slate-400", "text-orange-400"];

export function Leaderboard({
  rows,
  highlightId,
  loading,
  size = "middle",
  onSelect,
}: {
  rows: BoardRow[];
  highlightId?: string;
  loading?: boolean;
  size?: "small" | "middle";
  onSelect?: (id: string) => void;
}) {
  return (
    <Table<BoardRow>
      rowKey="id"
      size={size}
      loading={loading}
      dataSource={rows}
      pagination={false}
      locale={{ emptyText: <Empty description="ยังไม่มีผู้ส่งข้อสอบ" /> }}
      rowClassName={(r) => `${r.id === highlightId ? "bg-amber-50" : ""} ${onSelect ? "cursor-pointer" : ""}`}
      onRow={onSelect ? (r) => ({ onClick: () => onSelect(r.id) }) : undefined}
      columns={[
        {
          title: "อันดับ",
          width: 72,
          render: (_, __, i) =>
            i < 3 ? <TrophyFilled className={`text-lg ${MEDAL[i]}`} /> : <span className="pl-1">{i + 1}</span>,
        },
        { title: "ชื่อ", dataIndex: "name", ellipsis: true },
        {
          title: "คะแนน",
          dataIndex: "score",
          width: 110,
          render: (s: number) => (
            <Tag color={s >= (PASS_PERCENT / 100) * TOTAL_QUESTIONS ? "green" : "default"} className="m-0 font-semibold">
              {s}/{TOTAL_QUESTIONS}
            </Tag>
          ),
        },
        { title: "เวลาที่ใช้", dataIndex: "usedSec", width: 120, responsive: ["sm"], render: (v) => formatUsed(v) },
      ]}
    />
  );
}
