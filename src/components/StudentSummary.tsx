"use client";

import { useMemo } from "react";
import { Badge, Collapse, Drawer, Empty, Progress, Spin, Statistic, Tag } from "antd";
import { CHOICE_LABELS, PASS_PERCENT, TOTAL_QUESTIONS, formatUsed, type FullQuestion } from "@/lib/exam-meta";
import { STATUS_TEXT, summarize, type StudentRecord } from "@/lib/summary";

const pct = (right: number, total: number) => (total ? Math.round((right / total) * 100) : 0);
const barColor = (p: number) => (p >= PASS_PERCENT ? "#16a34a" : p >= 40 ? "#f59e0b" : "#dc2626");

// สรุปผลรายบุคคลสำหรับครู: เปิดจากการกดชื่อนักเรียน อัปเดตตามคำตอบล่าสุดแบบเรียลไทม์
export function StudentSummaryDrawer({
  row,
  rank,
  total,
  online,
  questions,
  onClose,
}: {
  row: StudentRecord | null;
  rank: number;
  total: number;
  online: boolean;
  questions: FullQuestion[] | null;
  onClose: () => void;
}) {
  const summary = useMemo(() => (row && questions?.length ? summarize(row, questions) : null), [row, questions]);

  // มาตรฐานที่ควรทบทวน: ตอบไปแล้วอย่างน้อย 3 ข้อ และถูกต่ำกว่าเกณฑ์ เรียงจากอ่อนสุด
  const weak = useMemo(
    () =>
      (summary?.byStd ?? [])
        .filter((s) => s.answered >= 3 && pct(s.right, s.answered) < PASS_PERCENT + 10)
        .sort((a, b) => a.right / a.answered - b.right / b.answered),
    [summary],
  );

  return (
    <Drawer
      open={row !== null}
      onClose={onClose}
      size={640}
      title={
        row && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={row.status === "submitted" ? "default" : online ? "success" : "error"} />
            <span>{row.name}</span>
            <Tag className="m-0 font-mono">ที่นั่ง {String(row.seatNo).padStart(3, "0")}</Tag>
            <Tag className="m-0 font-mono">{row.examCode}</Tag>
            <Tag className="m-0" color={row.status === "submitted" ? "default" : "processing"}>
              {STATUS_TEXT[row.status]}
            </Tag>
          </div>
        )
      }
    >
      {!row ? null : !summary ? (
        <div className="grid place-items-center py-10">
          <Spin />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Statistic
              title="คะแนน"
              value={row.score}
              suffix={`/ ${TOTAL_QUESTIONS}`}
              styles={{ content: { color: summary.passed ? "#16a34a" : undefined } }}
            />
            <Statistic title="อันดับในห้อง" value={rank} suffix={`/ ${total}`} />
            <Statistic title="ตอบแล้ว" value={row.answered} suffix={`/ ${TOTAL_QUESTIONS}`} />
            <Statistic title="เวลาที่ใช้" value={row.usedSec == null ? "กำลังทำ" : formatUsed(row.usedSec)} />
          </div>
          <Tag color={summary.passed ? "success" : "error"} className="m-0 px-3 py-1 text-sm">
            {summary.passed ? "ผ่านเกณฑ์" : "ยังไม่ผ่านเกณฑ์"} ร้อยละ {PASS_PERCENT}
            {row.status !== "submitted" && " (ยังสอบไม่เสร็จ)"}
          </Tag>

          <section>
            <h3 className="mb-2 text-base font-semibold">คะแนนรายมาตรฐาน</h3>
            <div className="space-y-2.5">
              {summary.byStd.map((s) => {
                const p = pct(s.right, s.total);
                return (
                  <div key={s.std}>
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate" title={s.name}>
                        มาตรฐานที่ {s.std} · {s.short}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <b>{s.right}</b>/{s.total}
                        {s.answered < s.total && <span className="text-slate-400"> (ตอบ {s.answered})</span>}
                      </span>
                    </div>
                    <Progress percent={p} showInfo={false} strokeColor={barColor(p)} className="m-0" />
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold">ระดับการคิด</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {summary.byLevel.map((l) => (
                <div key={l.level} className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-xs text-slate-500">{l.label}</div>
                  <div className="text-lg font-semibold tabular-nums">
                    {l.right}/{l.total}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold">ควรทบทวน</h3>
            {weak.length === 0 ? (
              <p className="m-0 text-sm text-slate-500">
                {summary.wrong.length === 0 ? "ยังไม่มีข้อที่ตอบผิด" : "ทุกมาตรฐานที่ทำไปผ่านเกณฑ์ดี ดูรายการข้อที่ผิดด้านล่าง"}
              </p>
            ) : (
              <ul className="m-0 space-y-2 pl-5 text-sm">
                {weak.map((s) => (
                  <li key={s.std}>
                    <b>
                      มาตรฐานที่ {s.std} {s.short}
                    </b>{" "}
                    (ถูก {pct(s.right, s.answered)}% ของข้อที่ทำ)
                    <ConceptTags items={summary.wrong.filter((w) => w.q.std === s.std).map((w) => w.q)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold">ข้อที่ตอบผิด ({summary.wrong.length})</h3>
            {summary.wrong.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="ไม่มีข้อที่ตอบผิด" />
            ) : (
              <Collapse
                size="small"
                items={summary.wrong.map(({ q, chosen }) => ({
                  key: q.n,
                  label: (
                    <span>
                      <b>ข้อ {q.n}</b> · {q.concept}{" "}
                      <span className="text-slate-500">
                        (ตอบ <span className="text-red-600">{CHOICE_LABELS[chosen]}</span> · เฉลย{" "}
                        <span className="text-green-700">{CHOICE_LABELS[q.correct]}</span>)
                      </span>
                    </span>
                  ),
                  children: (
                    <div className="space-y-2 text-sm">
                      {q.scenario && <p className="m-0 whitespace-pre-line text-slate-500">{q.scenario}</p>}
                      <p className="m-0 font-medium">{q.stem}</p>
                      <div className="rounded-md border border-red-300 bg-red-50 p-2">
                        <b>ตอบ {CHOICE_LABELS[chosen]}.</b> {q.options[chosen]}
                        <div className="text-xs text-slate-500">{q.why[chosen]}</div>
                      </div>
                      <div className="rounded-md border border-green-600 bg-green-50 p-2">
                        <b>เฉลย {CHOICE_LABELS[q.correct]}.</b> {q.options[q.correct]}
                      </div>
                      <p className="m-0 rounded-md bg-blue-50 p-2 text-slate-700">{q.explanation}</p>
                    </div>
                  ),
                }))}
              />
            )}
          </section>

          {summary.blank.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold">ยังไม่ได้ตอบ ({summary.blank.length})</h3>
              <div className="flex flex-wrap gap-1">
                {summary.blank.map((n) => (
                  <Tag key={n} className="m-0 tabular-nums">
                    {n}
                  </Tag>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

// แสดงเรื่องที่ตอบผิดไม่เกิน 6 เรื่อง ที่เหลือสรุปเป็นจำนวน (ดูครบได้ในรายการข้อที่ตอบผิด)
function ConceptTags({ items }: { items: FullQuestion[] }) {
  const shown = items.slice(0, 6);
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {shown.map((q) => (
        <Tag key={q.n} className="m-0">
          ข้อ {q.n} · {q.concept}
        </Tag>
      ))}
      {items.length > shown.length && <Tag className="m-0 text-slate-500">และอีก {items.length - shown.length} ข้อ</Tag>}
    </div>
  );
}
