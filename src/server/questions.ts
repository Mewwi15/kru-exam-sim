import "server-only";
import data from "@/data/questions.json";
import type { FullQuestion, PublicQuestion } from "@/lib/exam-meta";

// เฉลยอยู่ฝั่ง server เท่านั้น — ผู้สอบได้รับเฉพาะ PUBLIC_QUESTIONS ระหว่างสอบ
export const QUESTIONS = data.questions as FullQuestion[];

export const PUBLIC_QUESTIONS: PublicQuestion[] = QUESTIONS.map(
  ({ n, std, group, scenario, stem, options }) => ({ n, std, group, scenario, stem, options }),
);

const KEY = new Map(QUESTIONS.map((q) => [q.n, q.correct]));

export function isValidQuestion(n: number): boolean {
  return KEY.has(n);
}

export function isCorrect(n: number, choice: number): boolean {
  return KEY.get(n) === choice;
}
