// จำลองห้องสอบจริง: ครู 1 คน + นักเรียน N คน เข้าห้อง → ครูกดเริ่ม → ทุกคนตอบครบ 100 ข้อ → ส่ง → ครูจบการสอบ
// วัด: เวลาตอบกลับของ API, เวลาที่สัญญาณ "เริ่มสอบ" ไปถึงนักเรียน, เวลาที่ครูเห็นคำตอบ, และตรวจว่าคะแนนถูกต้องทุกคน
//
// ใช้: node --env-file=.env.local scripts/simulate.mjs
//      STUDENTS=60 THINK_MS=300 BASE_URL=https://your-app.vercel.app node --env-file=.env.local scripts/simulate.mjs

import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const N = Number(process.env.STUDENTS ?? 40);
const THINK_MS = Number(process.env.THINK_MS ?? 400); // เวลาคิดเฉลี่ยต่อข้อของนักเรียนจำลอง
const supa = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (arr) =>
  `n=${arr.length} p50=${pct(arr, 50)?.toFixed(0)}ms p95=${pct(arr, 95)?.toFixed(0)}ms p99=${pct(arr, 99)?.toFixed(0)}ms max=${Math.max(...arr).toFixed(0)}ms`;

async function call(path, { body, token, teacher, method } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["x-attempt-token"] = token;
  if (teacher) headers["x-teacher-token"] = teacher;
  const t0 = performance.now();
  const res = await fetch(BASE + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(data)}`);
  return { data, ms };
}

function subscribe(channel) {
  return new Promise((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") resolve();
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
    });
  });
}

const lat = { join: [], answer: [], submit: [], startDelivery: [], teacherLag: [] };
const errors = [];

// 1) ครูสร้างห้อง
const { data: room } = await call("/api/rooms", { body: { title: `ห้องทดสอบโหลด ${N} คน`, durationMin: 30 } });
const teacher = room.teacherToken;
console.log(`ห้อง ${room.code} สร้างแล้ว`);
const { data: qdata } = await call(`/api/rooms/${room.code}/questions`, { teacher });
const key = new Map(qdata.questions.map((q) => [q.n, q.correct]));

// 2) ครูเปิดช่องรับเหตุการณ์
let { data: snap } = await call(`/api/rooms/${room.code}/snapshot`, { teacher });
const teacherClient = supa();
const sentAt = new Map(); // `${attemptId}:${q}` -> เวลาที่นักเรียนกดตอบ
let teacherEvents = { join: 0, answer: 0, submit: 0 };
// สิ่งที่ "หน้าครู" เห็น: รวมจาก realtime + การดึงเฉพาะส่วนที่เปลี่ยนทุก 2 วินาที (แบบเดียวกับหน้าเว็บ)
const teacherView = new Map(); // `${attemptId}:${q}` -> choice
const teacherStatus = new Map(); // attemptId -> status
const tch = teacherClient
  .channel(`proctor:${snap.room.teacherChannel}`)
  .on("broadcast", { event: "join" }, () => teacherEvents.join++)
  .on("broadcast", { event: "answer" }, ({ payload }) => {
    teacherEvents.answer++;
    const now = performance.now();
    for (const [q, c] of payload.items) {
      const t = sentAt.get(`${payload.id}:${q}`);
      if (t) lat.teacherLag.push(now - t);
      teacherView.set(`${payload.id}:${q}`, c);
    }
  })
  .on("broadcast", { event: "submit" }, ({ payload }) => {
    teacherEvents.submit++;
    teacherStatus.set(payload.id, payload.status);
  });
await subscribe(tch);

let since = snap.serverNow;
let deltaPolls = 0;
const deltaPayloadBytes = [];
const pollTimer = setInterval(async () => {
  try {
    const q = new Date(new Date(since).getTime() - 5000).toISOString();
    const res = await fetch(`${BASE}/api/rooms/${room.code}/changes?since=${encodeURIComponent(q)}`, { headers: { "x-teacher-token": teacher } });
    const text = await res.text();
    deltaPayloadBytes.push(text.length);
    const ch = JSON.parse(text);
    since = ch.serverNow;
    deltaPolls++;
    for (const a of ch.attempts) teacherStatus.set(a.id, a.status);
    for (const [id, q2, c] of ch.answers) teacherView.set(`${id}:${q2}`, c);
  } catch (e) {
    errors.push(`poll: ${e}`);
  }
}, 2000);

// 3) นักเรียนเข้าห้องพร้อมกัน และรอสัญญาณเริ่ม
const students = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const { data, ms } = await call("/api/attempts", { body: { name: `นักเรียนจำลอง ${i + 1}`, roomCode: room.code } });
    lat.join.push(ms);
    const client = supa();
    const s = { i, id: data.attemptId, token: data.token, client, started: null, expected: 0 };
    s.channel = client.channel(`room:${room.code}`).on("broadcast", { event: "start" }, () => {
      s.started = performance.now();
    });
    await subscribe(s.channel);
    return s;
  }),
);
await sleep(1500);
console.log(`นักเรียนเข้าห้อง ${students.length} คน, ครูได้รับแจ้งเข้าห้อง ${teacherEvents.join} ครั้ง`);

// 4) ครูกดเริ่ม
const t0 = performance.now();
await call(`/api/rooms/${room.code}/start`, { teacher, method: "POST" });
await sleep(2000);
for (const s of students) {
  if (s.started) lat.startDelivery.push(s.started - t0);
  else errors.push(`นักเรียน ${s.i + 1} ไม่ได้รับสัญญาณเริ่ม`);
}

// 5) ทุกคนทำข้อสอบพร้อมกัน (สุ่มคำตอบ บางข้อเปลี่ยนใจ)
const tAnswer = performance.now();
await Promise.all(
  students.map(async (s) => {
    const chosen = new Map();
    for (let q = 1; q <= 100; q++) {
      await sleep(THINK_MS * (0.3 + Math.random() * 1.4));
      let choice = Math.floor(Math.random() * 5);
      if (Math.random() < 0.08) choice = (choice + 1) % 5; // เปลี่ยนใจ
      chosen.set(q, choice);
      sentAt.set(`${s.id}:${q}`, performance.now());
      try {
        const { ms } = await call(`/api/attempts/${s.id}/answers`, { token: s.token, body: { items: [{ q, choice }] } });
        lat.answer.push(ms);
      } catch (e) {
        errors.push(String(e));
      }
    }
    s.chosen = chosen;
    s.expected = [...chosen].filter(([q, c]) => key.get(q) === c).length;
    const { ms } = await call(`/api/attempts/${s.id}/submit`, { token: s.token, method: "POST" });
    lat.submit.push(ms);
  }),
);
const answerSecs = (performance.now() - tAnswer) / 1000;
await sleep(4500); // ให้การดึงรอบสุดท้ายของหน้าครูทำงาน
clearInterval(pollTimer);

// หน้าครูเห็นคำตอบสุดท้ายของทุกคนครบและถูกต้องหรือไม่
let viewWrong = 0;
for (const s of students)
  for (const [q, c] of s.chosen) if (teacherView.get(`${s.id}:${q}`) !== c) viewWrong++;
const statusWrong = students.filter((s) => teacherStatus.get(s.id) !== "submitted").length;
if (viewWrong) errors.push(`หน้าครูแสดงคำตอบไม่ตรง ${viewWrong} ช่อง`);
if (statusWrong) errors.push(`หน้าครูไม่เห็นสถานะส่งแล้ว ${statusWrong} คน`);

// 6) ตรวจคะแนนกับที่ควรได้ + จบห้อง
({ data: snap } = await call(`/api/rooms/${room.code}/snapshot`, { teacher }));
const byId = new Map(snap.attempts.map((a) => [a.id, a]));
let mismatches = 0;
for (const s of students) {
  const a = byId.get(s.id);
  if (!a || a.score !== s.expected || a.answered !== 100 || a.status !== "submitted") {
    mismatches++;
    errors.push(`คะแนนไม่ตรง: นักเรียน ${s.i + 1} ควรได้ ${s.expected} ได้ ${a?.score} (${a?.answered} ข้อ, ${a?.status})`);
  }
}
await call(`/api/rooms/${room.code}/end`, { teacher, method: "POST" });

const totalAnswers = lat.answer.length;
console.log("\n===== ผลการจำลอง =====");
console.log(`นักเรียน ${N} คน · ตอบรวม ${totalAnswers} ครั้งใน ${answerSecs.toFixed(1)} วินาที (${(totalAnswers / answerSecs).toFixed(0)} ครั้ง/วินาที)`);
console.log(`เข้าห้อง (API)            ${fmt(lat.join)}`);
console.log(`สัญญาณเริ่มถึงนักเรียน      ${fmt(lat.startDelivery)}  (${lat.startDelivery.length}/${N} คน)`);
console.log(`บันทึกคำตอบ (API)         ${fmt(lat.answer)}`);
console.log(`ครูเห็นคำตอบหลังนักเรียนกด ${fmt(lat.teacherLag)}  (${lat.teacherLag.length}/${totalAnswers})`);
console.log(`ส่งข้อสอบ (API)           ${fmt(lat.submit)}`);
console.log(`ครูได้รับเหตุการณ์: เข้าห้อง ${teacherEvents.join}/${N}, คำตอบ ${teacherEvents.answer}, ส่ง ${teacherEvents.submit}/${N}`);
console.log(`คะแนนตรงกับที่ควรได้: ${N - mismatches}/${N} คน`);
console.log(`หน้าครู (realtime + ดึงทุก 2 วิ) เห็นคำตอบถูกต้อง ${N * 100 - viewWrong}/${N * 100} ช่อง, เห็นสถานะส่งแล้ว ${N - statusWrong}/${N} คน`);
console.log(`ดึงส่วนที่เปลี่ยน ${deltaPolls} ครั้ง ขนาดเฉลี่ย ${(deltaPayloadBytes.reduce((a, b) => a + b, 0) / Math.max(1, deltaPayloadBytes.length) / 1024).toFixed(1)} KB`);
if (errors.length) {
  console.log(`\nข้อผิดพลาด ${errors.length} รายการ:`);
  for (const e of errors.slice(0, 15)) console.log(" -", e);
}

for (const s of students) await s.client.removeAllChannels();
await teacherClient.removeAllChannels();
process.exit(errors.length ? 1 : 0);
