"use client";

import { memo } from "react";
import { STANDARDS, type PublicQuestion } from "@/lib/exam-meta";

type Props = {
  questions: PublicQuestion[];
  current: number;
  answers: Record<number, number>;
  flags: Set<number>;
  onJump: (index: number) => void;
};

// ตารางเลือกข้อ 1–100 แบ่งตามมาตรฐาน (ปุ่ม HTML ธรรมดา เพื่อให้ render 100 ปุ่มได้เร็ว)
export const QuestionNavigator = memo(function QuestionNavigator({ questions, current, answers, flags, onJump }: Props) {
  return (
    <div className="space-y-3">
      {STANDARDS.map((s) => {
        const qs = questions.map((q, i) => ({ q, i })).filter(({ q }) => q.std === s.std);
        if (qs.length === 0) return null;
        return (
          <div key={s.std}>
            <div className="mb-1.5 text-xs font-semibold text-slate-500">
              มาตรฐานที่ {s.std} · {s.short}
            </div>
            <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 lg:grid-cols-8 xl:grid-cols-10">
              {qs.map(({ q, i }) => {
                const answered = answers[q.n] !== undefined;
                const flagged = flags.has(q.n);
                const isCurrent = i === current;
                return (
                  <button
                    key={q.n}
                    type="button"
                    onClick={() => onJump(i)}
                    aria-label={`ข้อ ${q.n}${answered ? " ตอบแล้ว" : ""}${flagged ? " ทำเครื่องหมายไว้" : ""}`}
                    className={`relative h-8 cursor-pointer rounded-md border text-xs font-medium transition-colors ${
                      answered
                        ? "border-blue-900 bg-blue-900 text-white hover:bg-blue-800"
                        : "border-slate-300 bg-white text-slate-700 hover:border-blue-700"
                    } ${isCurrent ? "ring-2 ring-amber-400 ring-offset-1" : ""}`}
                  >
                    {q.n}
                    {flagged && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded bg-blue-900" /> ตอบแล้ว
        </span>
        <span className="flex items-center gap-1">
          <span className="h-3 w-3 rounded border border-slate-300 bg-white" /> ยังไม่ตอบ
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> ทำเครื่องหมายไว้
        </span>
      </div>
    </div>
  );
});
