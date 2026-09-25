import { CHOICE_LABELS, PASS_PERCENT, STANDARDS, TOTAL_QUESTIONS, formatUsed, type FullQuestion } from "./exam-meta";

// ข้อมูลผู้สอบหนึ่งคนตามที่หน้าครูถืออยู่ (cells[i] = คำตอบข้อ i+1)
export type Cell = null | { c: number; ok: boolean };
export type StudentRecord = {
  id: string;
  name: string;
  seatNo: number;
  examCode: string;
  status: "waiting" | "running" | "submitted";
  score: number;
  answered: number;
  usedSec: number | null;
  cells: Cell[];
};

export const STATUS_TEXT: Record<StudentRecord["status"], string> = {
  waiting: "รอเริ่มสอบ",
  running: "กำลังสอบ",
  submitted: "ส่งแล้ว",
};

export const LEVEL_TEXT: Record<number, string> = {
  1: "L1 บอก/ระบุ",
  2: "L2 อธิบาย",
  3: "L3 ประยุกต์/วิเคราะห์",
  4: "L4 ประเมิน/สร้างสรรค์",
};

export type Tally = { total: number; answered: number; right: number };

export type StudentSummary = {
  byStd: (Tally & { std: number; short: string; name: string })[];
  byLevel: (Tally & { level: number; label: string })[];
  wrong: { q: FullQuestion; chosen: number }[];
  blank: number[];
  passed: boolean;
};

// สรุปผลรายบุคคลจากคำตอบที่มีอยู่แล้วในหน้าครู (ไม่ต้องเรียก server เพิ่ม)
export function summarize(row: StudentRecord, questions: FullQuestion[]): StudentSummary {
  const tally = (qs: FullQuestion[]): Tally => ({
    total: qs.length,
    answered: qs.filter((q) => row.cells[q.n - 1]).length,
    right: qs.filter((q) => row.cells[q.n - 1]?.ok).length,
  });
  return {
    byStd: STANDARDS.map((s) => ({ std: s.std, short: s.short, name: s.name, ...tally(questions.filter((q) => q.std === s.std)) })),
    byLevel: [1, 2, 3, 4].map((level) => ({ level, label: LEVEL_TEXT[level], ...tally(questions.filter((q) => q.level === level)) })),
    wrong: questions.flatMap((q) => {
      const cell = row.cells[q.n - 1];
      return cell && !cell.ok ? [{ q, chosen: cell.c }] : [];
    }),
    blank: questions.filter((q) => !row.cells[q.n - 1]).map((q) => q.n),
    passed: row.score >= (PASS_PERCENT / 100) * TOTAL_QUESTIONS,
  };
}

// อันดับในห้อง: คะแนนมากก่อน ถ้าเท่ากันใครใช้เวลาน้อยกว่าก่อน
export function rankRows<T extends Pick<StudentRecord, "score" | "usedSec" | "seatNo">>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.score - a.score || (a.usedSec ?? 1e9) - (b.usedSec ?? 1e9) || a.seatNo - b.seatNo);
}

// ไฟล์ CSV ที่เปิดใน Excel ได้ (มี BOM ให้ภาษาไทยไม่เพี้ยน)
// แถวแรกเป็นหัวตาราง แถวที่สองเป็นเฉลย ต่อด้วยนักเรียนเรียงตามอันดับ คำตอบที่ผิดมีเครื่องหมาย ✗ ต่อท้าย
export function roomCsv(rows: StudentRecord[], questions: FullQuestion[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "อันดับ",
    "ลำดับที่นั่ง",
    "ชื่อ",
    "รหัสผู้สอบ",
    "สถานะ",
    "คะแนน",
    `ผล (เกณฑ์ ${PASS_PERCENT}%)`,
    "ตอบแล้ว",
    "เวลาที่ใช้",
    ...STANDARDS.map((s) => `ม.${s.std} ${s.short} (${s.items})`),
    ...questions.map((q) => `ข้อ ${q.n}`),
  ];
  const keyRow = ["", "", "เฉลย", "", "", "", "", "", "", ...STANDARDS.map(() => ""), ...questions.map((q) => CHOICE_LABELS[q.correct])];
  const body = rankRows(rows).map((r, i) => {
    const s = summarize(r, questions);
    return [
      i + 1,
      String(r.seatNo).padStart(3, "0"),
      r.name,
      r.examCode,
      STATUS_TEXT[r.status],
      r.score,
      s.passed ? "ผ่าน" : "ไม่ผ่าน",
      r.answered,
      r.usedSec == null ? "" : formatUsed(r.usedSec),
      ...s.byStd.map((t) => t.right),
      ...questions.map((q) => {
        const cell = r.cells[q.n - 1];
        return cell ? `${CHOICE_LABELS[cell.c]}${cell.ok ? "" : " ✗"}` : "";
      }),
    ];
  });
  return "﻿" + [header, keyRow, ...body].map((line) => line.map(esc).join(",")).join("\r\n");
}

export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
