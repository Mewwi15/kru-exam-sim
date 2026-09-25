"use client";

import { useMemo } from "react";
import {
  Badge,
  Collapse,
  Drawer,
  Empty,
  Spin,
  Statistic,
  Tag,
  Tooltip,
} from "antd";
import {
  CHOICE_LABELS,
  PASS_PERCENT,
  TOTAL_QUESTIONS,
  formatUsed,
  type FullQuestion,
} from "@/lib/exam-meta";
import { STATUS_TEXT, summarize, type StudentRecord } from "@/lib/summary";

const pct = (right: number, total: number) =>
  total ? Math.round((right / total) * 100) : 0;

// สีกราฟ: แท่งของนักเรียนใช้สีเดียว (ผ่านตัวตรวจสีสำหรับผู้มีภาวะบกพร่องการเห็นสี) ค่าเฉลี่ยห้องเป็นสีเทาเข้ม
const BAR = "#2a78d6";
const TRACK = "#e8f0fb";

// สรุปผลรายบุคคลสำหรับครู: เปิดจากการกดชื่อนักเรียน อัปเดตตามคำตอบล่าสุดแบบเรียลไทม์
export function StudentSummaryDrawer({
  row,
  rank,
  total,
  online,
  questions,
  peers,
  onClose,
}: {
  row: StudentRecord | null;
  rank: number;
  total: number;
  online: boolean;
  questions: FullQuestion[] | null;
  peers: StudentRecord[];
  onClose: () => void;
}) {
  const summary = useMemo(
    () => (row && questions?.length ? summarize(row, questions) : null),
    [row, questions],
  );

  // ค่าเฉลี่ยห้องรายมาตรฐาน (ร้อยละที่ตอบถูก) จากทุกคนที่เริ่มตอบแล้ว
  const roomAvg = useMemo(() => {
    const started = peers.filter((p) => p.answered > 0);
    if (!questions?.length || started.length === 0) return null;
    const all = started.map((p) => summarize(p, questions).byStd);
    return all[0].map((s, i) => ({
      std: s.std,
      pct:
        all.reduce((sum, b) => sum + pct(b[i].right, b[i].total), 0) /
        all.length,
      right: all.reduce((sum, b) => sum + b[i].right, 0) / all.length,
      n: started.length,
    }));
  }, [peers, questions]);

  // มาตรฐานที่ควรทบทวน: ตอบไปแล้วอย่างน้อย 3 ข้อ และถูกต่ำกว่าเกณฑ์ เรียงจากอ่อนสุด
  const weak = useMemo(
    () =>
      (summary?.byStd ?? [])
        .filter(
          (s) =>
            s.answered >= 3 && pct(s.right, s.answered) < PASS_PERCENT + 10,
        )
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
            <Badge
              status={
                row.status === "submitted"
                  ? "default"
                  : online
                    ? "success"
                    : "error"
              }
            />
            <span>{row.name}</span>
            <Tag className="m-0 font-mono">
              ที่นั่ง {String(row.seatNo).padStart(3, "0")}
            </Tag>
            <Tag className="m-0 font-mono">{row.examCode}</Tag>
            <Tag
              className="m-0"
              color={row.status === "submitted" ? "default" : "processing"}
            >
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
              styles={{
                content: { color: summary.passed ? "#16a34a" : undefined },
              }}
            />
            <Statistic
              title="อันดับในห้อง"
              value={rank}
              suffix={`/ ${total}`}
            />
            <Statistic
              title="ตอบแล้ว"
              value={row.answered}
              suffix={`/ ${TOTAL_QUESTIONS}`}
            />
            <Statistic
              title="เวลาที่ใช้"
              value={row.usedSec == null ? "กำลังทำ" : formatUsed(row.usedSec)}
            />
          </div>
          <div>
            <Tag
              color={summary.passed ? "success" : "error"}
              className="m-0 px-3 py-1 text-sm"
            >
              {summary.passed ? "ผ่านเกณฑ์" : "ยังไม่ผ่านเกณฑ์"} ร้อยละ{" "}
              {PASS_PERCENT}
              {row.status !== "submitted" && " (ยังสอบไม่เสร็จ)"}
            </Tag>
          </div>

          <section>
            <h3 className="mb-2 text-base font-semibold">
              คะแนนรายมาตรฐาน เทียบกับค่าเฉลี่ยห้อง
            </h3>
            <StandardChart
              name={row.name}
              rows={summary.byStd.map((s, i) => ({
                ...s,
                avg: roomAvg?.[i] ?? null,
              }))}
            />
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
                {summary.wrong.length === 0
                  ? "ยังไม่มีข้อที่ตอบผิด"
                  : "ทุกมาตรฐานที่ทำไปผ่านเกณฑ์ดี ดูรายการข้อที่ผิดด้านล่าง"}
              </p>
            ) : (
              <ul className="m-0 space-y-2 pl-5 text-sm">
                {weak.map((s) => (
                  <li key={s.std}>
                    <b>
                      มาตรฐานที่ {s.std} {s.short}
                    </b>{" "}
                    (ถูก {pct(s.right, s.answered)}% ของข้อที่ทำ)
                    <ConceptTags
                      items={summary.wrong
                        .filter((w) => w.q.std === s.std)
                        .map((w) => w.q)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-base font-semibold">
              ข้อที่ตอบผิด ({summary.wrong.length})
            </h3>
            {summary.wrong.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="ไม่มีข้อที่ตอบผิด"
              />
            ) : (
              <Collapse
                size="small"
                items={summary.wrong.map(({ q, chosen }) => ({
                  key: q.n,
                  label: (
                    <span>
                      <b>ข้อ {q.n}</b> · {q.concept}{" "}
                      <span className="text-slate-500">
                        (ตอบ{" "}
                        <span className="text-red-600">
                          {CHOICE_LABELS[chosen]}
                        </span>{" "}
                        · เฉลย{" "}
                        <span className="text-green-700">
                          {CHOICE_LABELS[q.correct]}
                        </span>
                        )
                      </span>
                    </span>
                  ),
                  children: (
                    <div className="space-y-2 text-sm">
                      {q.scenario && (
                        <p className="m-0 whitespace-pre-line text-slate-500">
                          {q.scenario}
                        </p>
                      )}
                      <p className="m-0 font-medium">{q.stem}</p>
                      <div className="rounded-md border border-red-300 bg-red-50 p-2">
                        <b>ตอบ {CHOICE_LABELS[chosen]}.</b> {q.options[chosen]}
                        <div className="text-xs text-slate-500">
                          {q.why[chosen]}
                        </div>
                      </div>
                      <div className="rounded-md border border-green-600 bg-green-50 p-2">
                        <b>เฉลย {CHOICE_LABELS[q.correct]}.</b>{" "}
                        {q.options[q.correct]}
                      </div>
                      <p className="m-0 rounded-md bg-blue-50 p-2 text-slate-700">
                        {q.explanation}
                      </p>
                    </div>
                  ),
                }))}
              />
            )}
          </section>

          {summary.blank.length > 0 && (
            <section>
              <h3 className="mb-2 text-base font-semibold">
                ยังไม่ได้ตอบ ({summary.blank.length})
              </h3>
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
      {items.length > shown.length && (
        <Tag className="m-0 text-slate-500">
          และอีก {items.length - shown.length} ข้อ
        </Tag>
      )}
    </div>
  );
}

// กราฟแท่งแนวนอน 5 มาตรฐาน: แท่ง = ร้อยละที่นักเรียนคนนี้ตอบถูก, ขีดเทาเข้ม = ค่าเฉลี่ยห้อง, เส้นบาง = เกณฑ์ผ่าน
// ตัวเลขทุกค่าแสดงเป็นข้อความข้างแท่งด้วย จึงอ่านได้โดยไม่ต้องพึ่งสีหรือการชี้เมาส์
function StandardChart({
  name,
  rows,
}: {
  name: string;
  rows: {
    std: number;
    short: string;
    name: string;
    right: number;
    total: number;
    answered: number;
    avg: { pct: number; right: number; n: number } | null;
  }[];
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-4 rounded-r-[3px]"
            style={{ background: BAR }}
          />{" "}
          {name}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-0.5 rounded-full bg-slate-700" /> ค่าเฉลี่ยห้อง
          {rows[0]?.avg && (
            <span className="text-slate-400">({rows[0].avg.n} คน)</span>
          )}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-4 w-px bg-slate-400" /> เกณฑ์ผ่าน {PASS_PERCENT}%
        </span>
      </figcaption>
      <div className="space-y-3">
        {rows.map((r) => {
          const p = pct(r.right, r.total);
          const diff = r.avg ? p - r.avg.pct : null;
          return (
            <Tooltip
              key={r.std}
              trigger={["hover", "focus"]}
              title={
                <div className="text-sm">
                  <div>
                    <b className="text-base">{p}%</b> ถูก {r.right} จาก{" "}
                    {r.total} ข้อ
                  </div>
                  {r.avg && (
                    <div>
                      ค่าเฉลี่ยห้อง {Math.round(r.avg.pct)}% (
                      {r.avg.right.toFixed(1)} ข้อ)
                      {diff !== null &&
                        ` · ${diff >= 0 ? "สูงกว่า" : "ต่ำกว่า"} ${Math.abs(Math.round(diff))}%`}
                    </div>
                  )}
                  {r.answered < r.total && (
                    <div>
                      ตอบแล้ว {r.answered} จาก {r.total} ข้อ
                    </div>
                  )}
                  <div className="text-xs opacity-80">{r.name}</div>
                </div>
              }
            >
              <div
                tabIndex={0}
                className="group -mx-1 rounded-md px-1 py-0.5 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-blue-300"
              >
                <div className="mb-1 flex justify-between gap-3 text-sm">
                  <span className="truncate text-slate-700">
                    มาตรฐานที่ {r.std} · {r.short}
                  </span>
                  <span className="shrink-0 tabular-nums text-slate-900">
                    <b>{r.right}</b>/{r.total}
                    {r.answered < r.total && (
                      <span className="text-slate-400">
                        {" "}
                        (ตอบ {r.answered})
                      </span>
                    )}
                    {r.avg && (
                      <span className="text-slate-500">
                        {" "}
                        · ห้อง {r.avg.right.toFixed(1)}
                      </span>
                    )}
                  </span>
                </div>
                <div
                  className="relative h-3 rounded-r-[4px]"
                  style={{ background: TRACK }}
                >
                  <div
                    className="absolute -inset-y-0.5 w-px bg-slate-400"
                    style={{ left: `${PASS_PERCENT}%` }}
                  />
                  <div
                    className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width,filter] duration-300 group-hover:brightness-110"
                    style={{ width: `${p}%`, background: BAR }}
                  />
                  {r.avg && (
                    <div
                      className="absolute -inset-y-1 w-0.5 rounded-full bg-slate-700 ring-2 ring-white"
                      style={{ left: `calc(${r.avg.pct}% - 1px)` }}
                    />
                  )}
                </div>
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between px-0 text-[11px] text-slate-400 tabular-nums">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </figure>
  );
}
