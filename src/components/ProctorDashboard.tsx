"use client";

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  App,
  Badge,
  Button,
  Card,
  Empty,
  Popover,
  Progress,
  QRCode,
  Result,
  Segmented,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CaretRightOutlined,
  CopyOutlined,
  DownloadOutlined,
  HomeOutlined,
  LinkOutlined,
  QrcodeOutlined,
  StopOutlined,
  WifiOutlined,
} from "@ant-design/icons";
import { Brand } from "./Brand";
import { Countdown } from "./Countdown";
import { Leaderboard } from "./Leaderboard";
import { StudentSummaryDrawer } from "./StudentSummary";
import { api, ApiError, serverNow } from "@/lib/api";
import { proctorTopic, realtime, roomTopic } from "@/lib/realtime";
import { CHOICE_LABELS, PASS_PERCENT, STANDARDS, TOTAL_QUESTIONS, type FullQuestion } from "@/lib/exam-meta";
import { load, save, teacherKey } from "@/lib/storage";
import { downloadText, rankRows, roomCsv, type Cell, type StudentRecord } from "@/lib/summary";

// ── ชนิดข้อมูล ──────────────────────────────────────────────────────────────
type Status = StudentRecord["status"];
type Row = StudentRecord;
type RoomInfo = {
  code: string;
  title: string;
  status: "waiting" | "running" | "ended";
  durationSec: number;
  startedAt: string | null;
  endedAt: string | null;
  teacherChannel: string;
};
type AttemptInfo = Omit<Row, "cells">;
type Snapshot = {
  room: RoomInfo;
  attempts: AttemptInfo[];
  answers: [string, number, number, boolean][];
  serverNow: string;
};
type Changes = {
  room: Pick<RoomInfo, "status" | "startedAt" | "endedAt">;
  attempts: AttemptInfo[];
  answers: [string, number, number | null, boolean][];
  serverNow: string;
};
type FeedItem = { key: number; at: number; text: string; kind: "join" | "right" | "wrong" | "clear" | "submit" };

type State = { room: RoomInfo | null; rows: Map<string, Row>; feed: FeedItem[]; seq: number };
type Action =
  | { type: "snapshot"; snap: Snapshot }
  | { type: "join"; p: { id: string; name: string; seatNo: number; examCode: string; status: Status } }
  | { type: "answer"; p: { id: string; items: [number, number | null, boolean][]; score: number; answered: number } }
  | { type: "submit"; p: { id: string; status: Status; score: number; answered: number; usedSec: number | null } }
  | { type: "changes"; ch: Changes }
  | { type: "room"; room: Partial<RoomInfo> };

const emptyCells = (): Cell[] => Array.from({ length: TOTAL_QUESTIONS }, () => null);

function addFeed(state: State, items: Omit<FeedItem, "key" | "at">[]): Pick<State, "feed" | "seq"> {
  let seq = state.seq;
  const now = Date.now();
  const fresh = items.map((it) => ({ ...it, key: ++seq, at: now }));
  return { feed: [...fresh.reverse(), ...state.feed].slice(0, 60), seq };
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "snapshot": {
      const rows = new Map<string, Row>();
      for (const a of action.snap.attempts) rows.set(a.id, { ...a, cells: emptyCells() });
      for (const [id, q, c, ok] of action.snap.answers) {
        const r = rows.get(id);
        if (r && q >= 1 && q <= TOTAL_QUESTIONS) r.cells[q - 1] = { c, ok };
      }
      return { ...state, room: action.snap.room, rows };
    }
    case "join": {
      if (state.rows.has(action.p.id)) return state;
      const rows = new Map(state.rows);
      rows.set(action.p.id, { ...action.p, score: 0, answered: 0, usedSec: null, cells: emptyCells() });
      return { ...state, rows, ...addFeed(state, [{ kind: "join", text: `${action.p.name} เข้าห้องสอบ` }]) };
    }
    case "answer": {
      const prev = state.rows.get(action.p.id);
      if (!prev) return state;
      const cells = prev.cells.slice();
      const feed: Omit<FeedItem, "key" | "at">[] = [];
      for (const [q, c, ok] of action.p.items) {
        if (q < 1 || q > TOTAL_QUESTIONS) continue;
        cells[q - 1] = c === null ? null : { c, ok };
        feed.push(
          c === null
            ? { kind: "clear", text: `${prev.name} ล้างคำตอบข้อ ${q}` }
            : { kind: ok ? "right" : "wrong", text: `${prev.name} ตอบข้อ ${q} (${CHOICE_LABELS[c]}) ${ok ? "ถูก" : "ผิด"}` },
        );
      }
      const rows = new Map(state.rows);
      rows.set(prev.id, { ...prev, cells, score: action.p.score, answered: action.p.answered, status: "running" });
      return { ...state, rows, ...addFeed(state, feed) };
    }
    case "submit": {
      const prev = state.rows.get(action.p.id);
      if (!prev) return state;
      const rows = new Map(state.rows);
      rows.set(prev.id, { ...prev, ...action.p });
      return { ...state, rows, ...addFeed(state, [{ kind: "submit", text: `${prev.name} ส่งข้อสอบ ได้ ${action.p.score} คะแนน` }]) };
    }
    case "changes": {
      // ข้อมูลที่เปลี่ยนจากฐานข้อมูล: เติมส่วนที่ realtime อาจส่งไม่ถึง (ใช้ซ้ำได้ ไม่ซ้ำซ้อน)
      const rows = new Map(state.rows);
      const feed: Omit<FeedItem, "key" | "at">[] = [];
      for (const a of action.ch.attempts) {
        const prev = rows.get(a.id);
        if (!prev) feed.push({ kind: "join", text: `${a.name} เข้าห้องสอบ` });
        else if (prev.status !== "submitted" && a.status === "submitted")
          feed.push({ kind: "submit", text: `${a.name} ส่งข้อสอบ ได้ ${a.score} คะแนน` });
        rows.set(a.id, { ...(prev ?? { cells: emptyCells() }), ...a });
      }
      for (const [id, q, c, ok] of action.ch.answers) {
        const prev = rows.get(id);
        if (!prev || q < 1 || q > TOTAL_QUESTIONS) continue;
        const cur = prev.cells[q - 1];
        const same = c === null ? cur === null : cur !== null && cur.c === c && cur.ok === ok;
        if (same) continue;
        const cells = prev.cells.slice();
        cells[q - 1] = c === null ? null : { c, ok };
        rows.set(id, { ...prev, cells });
        feed.push(
          c === null
            ? { kind: "clear", text: `${prev.name} ล้างคำตอบข้อ ${q}` }
            : { kind: ok ? "right" : "wrong", text: `${prev.name} ตอบข้อ ${q} (${CHOICE_LABELS[c]}) ${ok ? "ถูก" : "ผิด"}` },
        );
      }
      const room = state.room ? { ...state.room, ...action.ch.room } : state.room;
      return { ...state, room, rows, ...addFeed(state, feed) };
    }
    case "room":
      return state.room ? { ...state, room: { ...state.room, ...action.room } } : state;
  }
}

// ช่วงข้อของแต่ละมาตรฐาน (ข้อสอบเรียงตามมาตรฐาน)
const STD_RANGES = STANDARDS.reduce<{ std: number; from: number; to: number }[]>((acc, s) => {
  const from = acc.length ? acc[acc.length - 1].to + 1 : 1;
  acc.push({ std: s.std, from, to: from + s.items - 1 });
  return acc;
}, []);

// ── หน้าหลัก ────────────────────────────────────────────────────────────────
export default function ProctorDashboard({ code, tokenFromUrl }: { code: string; tokenFromUrl?: string }) {
  const router = useRouter();
  const { modal, message } = App.useApp();
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [state, dispatch] = useReducer(reducer, { room: null, rows: new Map(), feed: [], seq: 0 });
  const [questions, setQuestions] = useState<FullQuestion[] | null>(null);
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"seat" | "score">("seat");
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const autoEnded = useRef(false);
  const sinceRef = useRef<string | null>(null);
  const polling = useRef(false);

  // token ครู: จากลิงก์ (?t=) หรือจากเครื่องที่สร้างห้อง
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน window/localStorage ได้หลัง mount เท่านั้น
    setOrigin(window.location.origin);
    if (tokenFromUrl) {
      save(teacherKey(code), tokenFromUrl);
      setToken(tokenFromUrl);
      router.replace(`/proctor/${code}`);
    } else {
      setToken(load<string | null>(teacherKey(code), null));
    }
  }, [code, tokenFromUrl, router]);

  const loadSnapshot = useCallback(async () => {
    if (!token) return;
    try {
      const snap = await api<Snapshot>(`/api/rooms/${code}/snapshot`, { teacherToken: token });
      sinceRef.current = snap.serverNow;
      dispatch({ type: "snapshot", snap });
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [code, token]);

  useEffect(() => {
    if (!token) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดข้อมูลครั้งแรกเมื่อได้ token
    void loadSnapshot();
    api<{ questions: FullQuestion[] }>(`/api/rooms/${code}/questions`, { teacherToken: token })
      .then((r) => setQuestions(r.questions))
      .catch(() => setQuestions([]));
  }, [token, code, loadSnapshot]);

  // ช่องลับของครู: รับเหตุการณ์ เข้าห้อง / ตอบ / ส่ง แบบทันที
  const teacherChannel = state.room?.teacherChannel;
  useEffect(() => {
    if (!teacherChannel) return;
    const ch = realtime()
      .channel(proctorTopic(teacherChannel))
      .on("broadcast", { event: "join" }, ({ payload }) => dispatch({ type: "join", p: payload }))
      .on("broadcast", { event: "answer" }, ({ payload }) => dispatch({ type: "answer", p: payload }))
      .on("broadcast", { event: "submit" }, ({ payload }) => dispatch({ type: "submit", p: payload }))
      .subscribe((status) => {
        setLive(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void loadSnapshot(); // เติมเหตุการณ์ที่อาจพลาดระหว่างเชื่อมต่อ
      });
    return () => void realtime().removeChannel(ch);
  }, [teacherChannel, loadSnapshot]);

  // ช่องของห้อง: ดูว่าใครออนไลน์อยู่ (นักเรียนประกาศตัวผ่าน presence)
  useEffect(() => {
    if (!token) return;
    const ch = realtime().channel(roomTopic(code));
    ch.on("presence", { event: "sync" }, () => setOnline(new Set(Object.keys(ch.presenceState())))).subscribe();
    return () => void realtime().removeChannel(ch);
  }, [code, token]);

  // สำรอง: ทุก 2 วินาทีดึงเฉพาะสิ่งที่เปลี่ยน (ย้อนหลังเผื่อ 5 วินาที) ข้อมูลครูจึงไม่ตกหล่นแม้ realtime หลุด
  const roomStatus = state.room?.status;
  const pollChanges = useCallback(async () => {
    if (!token || !sinceRef.current || polling.current) return;
    polling.current = true;
    try {
      const since = new Date(new Date(sinceRef.current).getTime() - 5000).toISOString();
      const ch = await api<Changes>(`/api/rooms/${code}/changes?since=${encodeURIComponent(since)}`, { teacherToken: token });
      sinceRef.current = ch.serverNow;
      dispatch({ type: "changes", ch });
    } catch {
      // ลองใหม่รอบถัดไป
    } finally {
      polling.current = false;
    }
  }, [code, token]);

  useEffect(() => {
    if (!roomStatus || roomStatus === "ended") return;
    const fast = setInterval(() => void pollChanges(), 2000);
    const full = setInterval(() => void loadSnapshot(), 60000);
    return () => {
      clearInterval(fast);
      clearInterval(full);
    };
  }, [roomStatus, pollChanges, loadSnapshot]);

  const rows = useMemo(() => {
    const list = [...state.rows.values()];
    return sortBy === "seat"
      ? list.sort((a, b) => a.seatNo - b.seatNo)
      : list.sort((a, b) => b.score - a.score || b.answered - a.answered || a.seatNo - b.seatNo);
  }, [state.rows, sortBy]);

  const start = () => {
    modal.confirm({
      title: `เริ่มสอบพร้อมกัน ${state.rows.size} คน?`,
      content: "นาฬิกาของทุกคนจะเริ่มนับถอยหลังทันที นักเรียนที่เข้าห้องทีหลังจะได้เวลาเท่าที่เหลือ",
      okText: "เริ่มสอบ",
      cancelText: "ยกเลิก",
      onOk: async () => {
        try {
          const res = await api<{ status: RoomInfo["status"]; startedAt: string }>(`/api/rooms/${code}/start`, {
            method: "POST",
            teacherToken: token!,
          });
          dispatch({ type: "room", room: { status: res.status, startedAt: res.startedAt } });
          void loadSnapshot();
        } catch (e) {
          message.error((e as ApiError).message);
        }
      },
    });
  };

  const end = useCallback(
    async (auto = false) => {
      setBusy(true);
      try {
        await api(`/api/rooms/${code}/end`, { method: "POST", teacherToken: token! });
        dispatch({ type: "room", room: { status: "ended" } });
        await loadSnapshot();
        if (auto) message.info("หมดเวลาสอบ ระบบเก็บกระดาษคำตอบทุกคนแล้ว");
      } catch (e) {
        message.error((e as ApiError).message);
      } finally {
        setBusy(false);
      }
    },
    [code, token, loadSnapshot, message],
  );

  const confirmEnd = () =>
    modal.confirm({
      title: "จบการสอบตอนนี้?",
      content: "ทุกคนที่ยังไม่ส่งจะถูกเก็บกระดาษคำตอบทันที และไปที่หน้าผลสอบ",
      okText: "จบการสอบ",
      okButtonProps: { danger: true },
      cancelText: "ยกเลิก",
      onOk: () => end(),
    });

  const deadline =
    state.room?.startedAt != null ? new Date(state.room.startedAt).getTime() + state.room.durationSec * 1000 : null;

  // หมดเวลาแล้วเกิน 30 วินาที: ปิดห้องให้อัตโนมัติ (เก็บคนที่ยังไม่ส่ง)
  useEffect(() => {
    if (roomStatus !== "running" || deadline == null) return;
    const id = setInterval(() => {
      if (!autoEnded.current && serverNow() > deadline + 30000) {
        autoEnded.current = true;
        void end(true);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [roomStatus, deadline, end]);

  if (token === null || error) {
    return (
      <Result
        status="403"
        title={error ?? "เครื่องนี้ไม่มีสิทธิ์คุมห้องสอบนี้"}
        subTitle="เปิดจากเครื่องที่สร้างห้อง หรือใช้ลิงก์สำหรับครูที่คัดลอกไว้"
        extra={<Link href="/proctor"><Button type="primary">ไปหน้าสร้างห้องสอบ</Button></Link>}
      />
    );
  }
  if (!state.room) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spin size="large" />
      </div>
    );
  }

  const room = state.room;
  const all = [...state.rows.values()];
  const submitted = all.filter((r) => r.status === "submitted").length;
  const withAnswers = all.filter((r) => r.answered > 0);
  const avgScore = withAnswers.length ? withAnswers.reduce((s, r) => s + r.score, 0) / withAnswers.length : 0;
  const avgAnswered = all.length ? all.reduce((s, r) => s + r.answered, 0) / all.length : 0;
  const ranked = rankRows(all);
  const selected = selectedId ? (state.rows.get(selectedId) ?? null) : null;
  const joinUrl = `${origin}/join/${room.code}`;
  const teacherUrl = `${origin}/proctor/${room.code}?t=${token}`;

  const copy = (text: string, label: string) =>
    navigator.clipboard.writeText(text).then(
      () => message.success(`คัดลอก${label}แล้ว`),
      () => message.error("คัดลอกไม่สำเร็จ"),
    );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3 px-4 py-2">
          <Brand compact />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{room.title}</div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <RoomStatusTag status={room.status} />
              <Tooltip title={live ? "เชื่อมต่อแบบเรียลไทม์อยู่ (มีการตรวจซ้ำทุก 2 วินาที)" : "กำลังเชื่อมต่อ… (ข้อมูลยังอัปเดตทุก 2 วินาที)"}>
                <span className={live ? "text-green-600" : "text-amber-600"}>
                  <WifiOutlined /> {live ? "เรียลไทม์" : "กำลังเชื่อมต่อ"}
                </span>
              </Tooltip>
            </div>
          </div>
          {room.status === "running" && deadline != null && <Countdown deadline={deadline} label="เหลือเวลาสอบ" />}
          {room.status === "waiting" && (
            <Button type="primary" size="large" icon={<CaretRightOutlined />} disabled={state.rows.size === 0} onClick={start}>
              เริ่มสอบพร้อมกัน
            </Button>
          )}
          {room.status === "running" && (
            <Button danger size="large" icon={<StopOutlined />} loading={busy} onClick={confirmEnd}>
              จบการสอบ
            </Button>
          )}
          <Link href="/">
            <Button icon={<HomeOutlined />} />
          </Link>
        </div>
      </header>

      <main className="space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
          <Card className="shadow-sm" size="small">
            <div className="text-xs text-slate-500">รหัสห้องสอบ (แจกให้นักเรียน)</div>
            <div className="my-1 flex items-center gap-2">
              <span className="font-mono text-4xl font-bold tracking-[0.2em] text-blue-900">{room.code}</span>
              <Button type="text" icon={<CopyOutlined />} onClick={() => copy(room.code, "รหัสห้อง")} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Popover
                trigger="click"
                content={
                  <div className="flex flex-col items-center gap-2">
                    <QRCode value={joinUrl || "-"} size={220} />
                    <Typography.Text copyable className="text-xs">
                      {joinUrl}
                    </Typography.Text>
                  </div>
                }
              >
                <Button icon={<QrcodeOutlined />}>QR เข้าห้อง</Button>
              </Popover>
              <Button icon={<LinkOutlined />} onClick={() => copy(joinUrl, "ลิงก์เข้าห้อง")}>
                ลิงก์นักเรียน
              </Button>
              <Tooltip title="เปิดหน้าคุมสอบนี้บนอีกเครื่อง (เก็บเป็นความลับ)">
                <Button onClick={() => copy(teacherUrl, "ลิงก์สำหรับครู")}>ลิงก์ครู</Button>
              </Tooltip>
            </div>
          </Card>
          <Card className="shadow-sm" size="small">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Statistic title="ผู้เข้าสอบ" value={all.length} suffix="คน" />
              <Statistic title="ออนไลน์" value={all.filter((r) => online.has(r.id)).length} suffix={`/ ${all.length}`} />
              <Statistic title="ส่งแล้ว" value={submitted} suffix={`/ ${all.length}`} />
              <Statistic title="คะแนนเฉลี่ย" value={avgScore} precision={1} />
              <Statistic title="ตอบแล้วเฉลี่ย" value={avgAnswered} precision={1} suffix="ข้อ" />
            </div>
          </Card>
        </div>

        <div className="grid gap-4 2xl:grid-cols-[1fr_320px]">
          <Card className="min-w-0 shadow-sm" size="small">
            <Tabs
              tabBarExtraContent={
                <Tooltip title="ไฟล์ CSV เปิดด้วย Excel ได้ มีคะแนนรายมาตรฐานและคำตอบทุกข้อของทุกคน">
                  <Button
                    size="small"
                    icon={<DownloadOutlined />}
                    disabled={!questions?.length || all.length === 0}
                    onClick={() => downloadText(`ผลสอบ-${room.code}.csv`, roomCsv(all, questions ?? []))}
                  >
                    ดาวน์โหลดผล (Excel)
                  </Button>
                </Tooltip>
              }
              items={[
                {
                  key: "grid",
                  label: "ติดตามรายคน",
                  children: (
                    <>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <Legend />
                        <Segmented
                          size="small"
                          value={sortBy}
                          onChange={(v) => setSortBy(v as "seat" | "score")}
                          options={[
                            { label: "เรียงตามที่นั่ง", value: "seat" },
                            { label: "เรียงตามคะแนน", value: "score" },
                          ]}
                        />
                      </div>
                      {rows.length === 0 ? (
                        <Empty description="ยังไม่มีนักเรียนเข้าห้อง แจกรหัสห้องหรือ QR ให้นักเรียนได้เลย" />
                      ) : (
                        <div className="overflow-x-auto">
                          <div className="min-w-max space-y-1">
                            <GridHeader />
                            {rows.map((r) => (
                              <StudentRow key={r.id} row={r} online={online.has(r.id)} onSelect={setSelectedId} />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ),
                },
                {
                  key: "items",
                  label: "วิเคราะห์รายข้อ",
                  children: <ItemAnalysis rows={all} questions={questions} />,
                },
                {
                  key: "rank",
                  label: "อันดับคะแนน",
                  children: (
                    <Leaderboard
                      rows={ranked.map((r) => ({ id: r.id, name: r.name, score: r.score, answered: r.answered, usedSec: r.usedSec, submittedAt: null }))}
                      onSelect={setSelectedId}
                    />
                  ),
                },
              ]}
            />
          </Card>
          <Card className="h-fit shadow-sm" size="small" title="ความเคลื่อนไหวล่าสุด">
            {state.feed.length === 0 ? (
              <p className="m-0 text-sm text-slate-400">ยังไม่มีความเคลื่อนไหว</p>
            ) : (
              <ul className="m-0 max-h-[60vh] list-none space-y-1 overflow-y-auto p-0 text-sm">
                {state.feed.map((f) => (
                  <li key={f.key} className="flex gap-2">
                    <span className="shrink-0 font-mono text-xs text-slate-400">
                      {new Date(f.at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                    <span
                      className={
                        f.kind === "right" ? "text-green-700" : f.kind === "wrong" ? "text-red-600" : f.kind === "submit" ? "font-medium text-blue-900" : "text-slate-600"
                      }
                    >
                      {f.text}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
      <StudentSummaryDrawer
        row={selected}
        rank={selected ? ranked.findIndex((r) => r.id === selected.id) + 1 : 0}
        total={all.length}
        online={selected ? online.has(selected.id) : false}
        questions={questions}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ── ส่วนประกอบย่อย ───────────────────────────────────────────────────────────
function RoomStatusTag({ status }: { status: RoomInfo["status"] }) {
  if (status === "waiting") return <Tag color="gold" className="m-0">รอเริ่มสอบ</Tag>;
  if (status === "running") return <Tag color="processing" className="m-0">กำลังสอบ</Tag>;
  return <Tag className="m-0">จบการสอบแล้ว</Tag>;
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-slate-500">
      <span className="flex items-center gap-1">
        <span className="h-3 w-2 rounded-sm bg-green-500" /> ตอบถูก
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-2 rounded-sm bg-red-500" /> ตอบผิด
      </span>
      <span className="flex items-center gap-1">
        <span className="h-3 w-2 rounded-sm bg-slate-200" /> ยังไม่ตอบ
      </span>
    </div>
  );
}

const LEFT_COLS = "grid w-[330px] shrink-0 grid-cols-[40px_1fr_62px_70px] items-center gap-2";

function GridHeader() {
  return (
    <div className="flex items-end gap-3 pb-1 text-[11px] text-slate-500">
      <div className={LEFT_COLS}>
        <span>ที่</span>
        <span>ชื่อ</span>
        <span>คะแนน</span>
        <span>ตอบแล้ว</span>
      </div>
      <div className="flex gap-1.5">
        {STD_RANGES.map((r) => (
          <div key={r.std} className="flex gap-px" title={`มาตรฐานที่ ${r.std}`}>
            {Array.from({ length: r.to - r.from + 1 }, (_, i) => {
              const n = r.from + i;
              return (
                <span key={n} className="w-[7px] text-center">
                  {n === r.from ? <span className="relative -left-0.5">ม.{r.std}</span> : ""}
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// แถวนักเรียนหนึ่งคน: render ใหม่เฉพาะแถวที่ข้อมูลเปลี่ยน
const StudentRow = memo(function StudentRow({
  row,
  online,
  onSelect,
}: {
  row: Row;
  online: boolean;
  onSelect: (id: string) => void;
}) {
  const passed = row.score >= (PASS_PERCENT / 100) * TOTAL_QUESTIONS;
  return (
    <div className="flex items-center gap-3 rounded-md px-1 py-1 hover:bg-slate-50">
      <div className={LEFT_COLS}>
        <span className="font-mono text-xs text-slate-500">{String(row.seatNo).padStart(3, "0")}</span>
        <span className="flex min-w-0 items-center gap-1.5">
          <Badge status={row.status === "submitted" ? "default" : online ? "success" : "error"} />
          <button
            type="button"
            onClick={() => onSelect(row.id)}
            className="cursor-pointer truncate border-0 bg-transparent p-0 text-left text-inherit hover:text-blue-700 hover:underline"
            title={`ดูสรุปรายบุคคล: ${row.name} · รหัสผู้สอบ ${row.examCode}`}
          >
            {row.name}
          </button>
          {row.status === "submitted" && <Tag className="m-0 px-1 text-[10px] leading-4">ส่งแล้ว</Tag>}
        </span>
        <span className={`font-semibold tabular-nums ${passed ? "text-green-600" : ""}`}>{row.score}</span>
        <span className="text-xs tabular-nums text-slate-500">
          {row.answered}/{TOTAL_QUESTIONS}
        </span>
      </div>
      <div className="flex gap-1.5">
        {STD_RANGES.map((r) => (
          <div key={r.std} className="flex gap-px">
            {row.cells.slice(r.from - 1, r.to).map((cell, i) => {
              const n = r.from + i;
              return (
                <span
                  key={n}
                  title={cell ? `ข้อ ${n}: ตอบ ${CHOICE_LABELS[cell.c]} (${cell.ok ? "ถูก" : "ผิด"})` : `ข้อ ${n}: ยังไม่ตอบ`}
                  className={`h-6 w-[7px] rounded-sm ${cell ? (cell.ok ? "bg-green-500" : "bg-red-500") : "bg-slate-200"}`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});

function ItemAnalysis({ rows, questions }: { rows: Row[]; questions: FullQuestion[] | null }) {
  const data = useMemo(() => {
    if (!questions) return [];
    return questions.map((q) => {
      const dist = [0, 0, 0, 0, 0];
      let answered = 0;
      for (const r of rows) {
        const cell = r.cells[q.n - 1];
        if (cell) {
          dist[cell.c]++;
          answered++;
        }
      }
      return { q, dist, answered, right: dist[q.correct], pct: answered ? (dist[q.correct] / answered) * 100 : null };
    });
  }, [rows, questions]);

  if (!questions) return <Spin />;
  return (
    <Table
      size="small"
      rowKey={(r) => r.q.n}
      dataSource={data}
      pagination={{ pageSize: 25, showSizeChanger: false }}
      expandable={{
        expandedRowRender: ({ q }) => (
          <div className="space-y-2 text-sm">
            {q.scenario && <p className="m-0 whitespace-pre-line text-slate-600">{q.scenario}</p>}
            <p className="m-0 font-medium">{q.stem}</p>
            <ol className="m-0 list-none space-y-1 p-0">
              {q.options.map((o, i) => (
                <li key={i} className={i === q.correct ? "font-medium text-green-700" : ""}>
                  {CHOICE_LABELS[i]}. {o} {i === q.correct && "✓"}
                </li>
              ))}
            </ol>
            <p className="m-0 rounded bg-blue-50 p-2 text-slate-700">{q.explanation}</p>
          </div>
        ),
      }}
      columns={[
        { title: "ข้อ", width: 56, render: (_, r) => r.q.n },
        { title: "ม.", width: 44, render: (_, r) => r.q.std, responsive: ["md"] },
        { title: "เรื่องที่วัด", render: (_, r) => r.q.concept, ellipsis: true },
        {
          title: "ตอบถูก",
          width: 170,
          sorter: (a, b) => (a.pct ?? -1) - (b.pct ?? -1),
          render: (_, r) =>
            r.pct === null ? (
              <span className="text-slate-400">ยังไม่มีคนตอบ</span>
            ) : (
              <Progress
                percent={Math.round(r.pct)}
                size="small"
                strokeColor={r.pct >= 60 ? "#16a34a" : r.pct >= 40 ? "#f59e0b" : "#dc2626"}
                format={() => `${r.right}/${r.answered}`}
              />
            ),
        },
        {
          title: "คนเลือกแต่ละตัวเลือก",
          width: 230,
          responsive: ["lg"],
          render: (_, r) => (
            <div className="flex gap-1">
              {r.dist.map((d, i) => (
                <span
                  key={i}
                  className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                    i === r.q.correct ? "bg-green-100 font-semibold text-green-800" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {CHOICE_LABELS[i]} {d}
                </span>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
}

