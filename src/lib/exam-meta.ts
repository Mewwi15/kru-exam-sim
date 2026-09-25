// ข้อมูลโครงสร้างข้อสอบ ใช้ได้ทั้งฝั่ง client และ server
// อ้างอิง: ผังการสร้างแบบทดสอบ (Test Blueprint) วิชาครู พ.ศ. 2566 ของคุรุสภา

export const TOTAL_QUESTIONS = 100;
export const PASS_PERCENT = 60;
export const DEFAULT_DURATION_MIN = 180;
export const CHOICE_LABELS = ["ก", "ข", "ค", "ง", "จ"] as const;

export type StandardNo = 1 | 2 | 3 | 4 | 5;

export const STANDARDS: { std: StandardNo; short: string; name: string; items: number }[] = [
  {
    std: 1,
    short: "บริบทโลกและเศรษฐกิจพอเพียง",
    name: "การเปลี่ยนแปลงบริบทของโลก สังคม และแนวคิดปรัชญาของเศรษฐกิจพอเพียง",
    items: 12,
  },
  {
    std: 2,
    short: "จิตวิทยา",
    name: "จิตวิทยาพัฒนาการ จิตวิทยาการศึกษา และจิตวิทยาให้คำปรึกษา",
    items: 25,
  },
  {
    std: 3,
    short: "หลักสูตร การสอน และเทคโนโลยีดิจิทัล",
    name: "หลักสูตร ศาสตร์การสอน และเทคโนโลยีดิจิทัลในการจัดการเรียนรู้",
    items: 30,
  },
  {
    std: 4,
    short: "วัดผล ประเมินผล และวิจัย",
    name: "การวัด ประเมินผลการเรียนรู้ และการวิจัยเพื่อแก้ปัญหาและพัฒนาผู้เรียน",
    items: 25,
  },
  {
    std: 5,
    short: "ประกันคุณภาพการศึกษา",
    name: "การออกแบบและการดำเนินการเกี่ยวกับงานประกันคุณภาพการศึกษา",
    items: 8,
  },
];

// คำถามที่ส่งให้ผู้สอบ (ไม่มีเฉลย)
export type PublicQuestion = {
  n: number;
  std: StandardNo;
  group: string | null;
  scenario: string;
  stem: string;
  options: string[];
};

// คำถามพร้อมเฉลย (ส่งให้หลังส่งข้อสอบ หรือให้ครูคุมสอบ)
export type FullQuestion = PublicQuestion & {
  sub: string;
  level: number;
  correct: number;
  why: string[];
  explanation: string;
  concept: string;
};

export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (v: number) => String(v).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export function formatUsed(sec: number | null | undefined): string {
  if (sec == null) return "-";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} ชม. ${m} นาที`;
  if (m > 0) return `${m} นาที`;
  return `${sec} วินาที`;
}

// ช่วงข้อของแต่ละชุดสถานการณ์ เช่น group "S2a-G1" -> ข้อ 13–15
export function groupRanges(questions: { n: number; group: string | null }[]) {
  const ranges = new Map<string, { from: number; to: number }>();
  for (const q of questions) {
    if (!q.group) continue;
    const r = ranges.get(q.group);
    if (!r) ranges.set(q.group, { from: q.n, to: q.n });
    else r.to = Math.max(r.to, q.n);
  }
  return ranges;
}
