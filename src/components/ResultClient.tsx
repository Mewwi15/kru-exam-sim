"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, Card, Collapse, Pagination, Progress, Result, Segmented, Spin, Statistic, Tag } from "antd";
import { CheckCircleFilled, CloseCircleFilled, HomeOutlined, MinusCircleOutlined, TrophyOutlined } from "@ant-design/icons";
import { Brand, Disclaimer } from "./Brand";
import { Leaderboard, type BoardRow } from "./Leaderboard";
import { api, ApiError } from "@/lib/api";
import { CHOICE_LABELS, PASS_PERCENT, STANDARDS, TOTAL_QUESTIONS, formatUsed, groupRanges, type FullQuestion } from "@/lib/exam-meta";
import { attemptKey, lastAttemptKey, load, remove, type SavedAttempt } from "@/lib/storage";

type Review = {
  attempt: {
    name: string;
    examCode: string;
    seatNo: number;
    score: number;
    answered: number;
    usedSec: number | null;
    submittedAt: string | null;
    room: { code: string; title: string; status: string } | null;
  };
  rank: number;
  participants: number;
  answers: Record<string, number>;
  questions: FullQuestion[];
};

type Filter = "all" | "wrong" | "blank" | "right";
const PAGE = 10;

export default function ResultClient({ attemptId }: { attemptId: string }) {
  const [data, setData] = useState<Review | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const saved = load<SavedAttempt | null>(attemptKey(attemptId), null);
    if (!saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
      setError("ไม่พบข้อมูลผู้สอบในเครื่องนี้");
      return;
    }
    api<Review>(`/api/attempts/${attemptId}/review`, { attemptToken: saved.token })
      .then((r) => {
        setData(r);
        if (load<SavedAttempt | null>(lastAttemptKey, null)?.id === attemptId) remove(lastAttemptKey);
        const q = r.attempt.room ? `?room=${r.attempt.room.code}&limit=50` : "?limit=20";
        return api<{ rows: BoardRow[] }>(`/api/leaderboard${q}`).then((b) => setBoard(b.rows));
      })
      .catch((e: ApiError) => setError(e.message));
  }, [attemptId]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.questions.filter((q) => {
      const a = data.answers[String(q.n)];
      if (filter === "blank") return a === undefined;
      if (filter === "wrong") return a !== undefined && a !== q.correct;
      if (filter === "right") return a === q.correct;
      return true;
    });
  }, [data, filter]);

  const ranges = useMemo(() => (data ? groupRanges(data.questions) : new Map()), [data]);

  if (error) {
    return <Result status="warning" title={error} extra={<Link href="/"><Button type="primary">กลับหน้าแรก</Button></Link>} />;
  }
  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spin size="large" />
      </div>
    );
  }

  const { attempt } = data;
  const passed = attempt.score >= (PASS_PERCENT / 100) * TOTAL_QUESTIONS;
  const byStd = STANDARDS.map((s) => {
    const qs = data.questions.filter((q) => q.std === s.std);
    const right = qs.filter((q) => data.answers[String(q.n)] === q.correct).length;
    return { ...s, right, total: qs.length };
  });
  const counts = {
    right: data.questions.filter((q) => data.answers[String(q.n)] === q.correct).length,
    wrong: data.questions.filter((q) => data.answers[String(q.n)] !== undefined && data.answers[String(q.n)] !== q.correct).length,
    blank: data.questions.filter((q) => data.answers[String(q.n)] === undefined).length,
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand />
          <Link href="/">
            <Button icon={<HomeOutlined />}>หน้าแรก</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6">
        <Card className="shadow-sm">
          <div className="grid gap-6 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center justify-center">
              <Progress
                type="circle"
                percent={attempt.score}
                size={150}
                strokeColor={passed ? "#16a34a" : "#dc2626"}
                format={() => (
                  <span className="text-slate-900">
                    <span className="block text-4xl font-bold">{attempt.score}</span>
                    <span className="text-sm text-slate-500">จาก {TOTAL_QUESTIONS}</span>
                  </span>
                )}
              />
              <Tag color={passed ? "success" : "error"} className="m-0 mt-3 px-3 py-1 text-base">
                {passed ? "ผ่านเกณฑ์" : "ยังไม่ผ่านเกณฑ์"} (เกณฑ์ {PASS_PERCENT}%)
              </Tag>
            </div>
            <div>
              <h1 className="mb-1 text-xl font-bold">{attempt.name}</h1>
              <p className="mb-4 text-slate-500">
                {attempt.room ? `${attempt.room.title} · ลำดับที่นั่ง ${String(attempt.seatNo).padStart(3, "0")}` : "สอบเดี่ยว"} · รหัสผู้สอบ{" "}
                <span className="font-mono">{attempt.examCode}</span>
              </p>
              <div className="mb-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Statistic title="อันดับ" value={data.rank} suffix={`/ ${data.participants}`} prefix={<TrophyOutlined />} />
                <Statistic title="ตอบถูก" value={counts.right} styles={{ content: { color: "#16a34a" } }} />
                <Statistic title="ตอบผิด" value={counts.wrong} styles={{ content: { color: "#dc2626" } }} />
                <Statistic title="เวลาที่ใช้" value={formatUsed(attempt.usedSec)} />
              </div>
              <div className="space-y-2">
                {byStd.map((s) => (
                  <div key={s.std} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                    <span className="truncate text-sm">
                      มาตรฐานที่ {s.std} · {s.short}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {s.right}/{s.total}
                    </span>
                    <Progress
                      className="col-span-2 m-0"
                      percent={Math.round((s.right / s.total) * 100)}
                      showInfo={false}
                      strokeColor={s.right / s.total >= PASS_PERCENT / 100 ? "#16a34a" : "#f59e0b"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
          <Card
            className="shadow-sm"
            title="เฉลยพร้อมคำอธิบาย"
            extra={
              <Segmented<Filter>
                size="small"
                value={filter}
                onChange={(v) => {
                  setFilter(v);
                  setPage(1);
                }}
                options={[
                  { label: `ทั้งหมด`, value: "all" },
                  { label: `ผิด ${counts.wrong}`, value: "wrong" },
                  { label: `ไม่ได้ตอบ ${counts.blank}`, value: "blank" },
                  { label: `ถูก ${counts.right}`, value: "right" },
                ]}
              />
            }
          >
            <div className="space-y-4">
              {rows.slice((page - 1) * PAGE, page * PAGE).map((q) => (
                <ReviewItem key={q.n} q={q} answer={data.answers[String(q.n)]} range={q.group ? ranges.get(q.group) : undefined} />
              ))}
              {rows.length === 0 && <p className="py-8 text-center text-slate-500">ไม่มีข้อในหมวดนี้</p>}
            </div>
            {rows.length > PAGE && (
              <div className="mt-4 flex justify-center">
                <Pagination
                  current={page}
                  pageSize={PAGE}
                  total={rows.length}
                  showSizeChanger={false}
                  onChange={(p) => {
                    setPage(p);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              </div>
            )}
          </Card>

          <Card
            className="h-fit shadow-sm"
            title={attempt.room ? "อันดับคะแนนในห้อง" : "อันดับคะแนน (สอบเดี่ยว)"}
            styles={{ body: { padding: 0 } }}
          >
            <Leaderboard rows={board ?? []} loading={board === null} size="small" />
          </Card>
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}

function ReviewItem({ q, answer, range }: { q: FullQuestion; answer: number | undefined; range?: { from: number; to: number } }) {
  const status = answer === undefined ? "blank" : answer === q.correct ? "right" : "wrong";
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {status === "right" && <CheckCircleFilled className="text-lg text-green-600" />}
        {status === "wrong" && <CloseCircleFilled className="text-lg text-red-600" />}
        {status === "blank" && <MinusCircleOutlined className="text-lg text-slate-400" />}
        <b>ข้อ {q.n}</b>
        <Tag className="m-0">มาตรฐานที่ {q.std}</Tag>
        <Tag className="m-0" color="geekblue">
          {q.concept}
        </Tag>
      </div>
      {q.scenario && (
        <Collapse
          size="small"
          className="mb-3"
          items={[
            {
              key: "s",
              label: range ? `สถานการณ์ (ใช้ตอบข้อ ${range.from}–${range.to})` : "สถานการณ์",
              children: <p className="m-0 leading-relaxed whitespace-pre-line text-slate-700">{q.scenario}</p>,
            },
          ]}
        />
      )}
      <p className="mb-3 font-medium whitespace-pre-line">{q.stem}</p>
      <ul className="m-0 mb-3 list-none space-y-1.5 p-0">
        {q.options.map((opt, i) => {
          const isKey = i === q.correct;
          const isMine = i === answer;
          return (
            <li
              key={i}
              className={`rounded-md border px-3 py-2 ${
                isKey ? "border-green-600 bg-green-50" : isMine ? "border-red-400 bg-red-50" : "border-slate-200"
              }`}
            >
              <div className="flex items-start gap-2">
                <b>{CHOICE_LABELS[i]}.</b>
                <span className="flex-1">{opt}</span>
                {isKey && <Tag color="success" className="m-0">เฉลย</Tag>}
                {isMine && !isKey && <Tag color="error" className="m-0">คุณตอบ</Tag>}
              </div>
              <p className="m-0 mt-1 text-xs text-slate-500">{q.why[i]}</p>
            </li>
          );
        })}
      </ul>
      <div className="rounded-md bg-blue-50 p-3 text-sm leading-relaxed text-slate-700">
        <b className="text-blue-900">คำอธิบาย: </b>
        {q.explanation}
      </div>
    </div>
  );
}
