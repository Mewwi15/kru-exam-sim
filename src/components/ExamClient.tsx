"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Card, Drawer, Radio, Result, Spin, Tag, Tooltip } from "antd";
import {
  AppstoreOutlined,
  CheckCircleFilled,
  CloudSyncOutlined,
  FlagFilled,
  FlagOutlined,
  LeftOutlined,
  RightOutlined,
  SendOutlined,
  WarningFilled,
} from "@ant-design/icons";
import { Brand } from "./Brand";
import { Countdown } from "./Countdown";
import { QuestionNavigator } from "./QuestionNavigator";
import { api, ApiError } from "@/lib/api";
import { AnswerQueue, type SyncState } from "@/lib/answer-queue";
import { realtime, roomTopic } from "@/lib/realtime";
import { CHOICE_LABELS, STANDARDS, TOTAL_QUESTIONS, groupRanges, type PublicQuestion } from "@/lib/exam-meta";
import { attemptKey, flagsKey, load, pendingKey, remove, save, type SavedAttempt } from "@/lib/storage";

export type AttemptState = {
  id: string;
  name: string;
  examCode: string;
  seatNo: number;
  status: "waiting" | "running" | "submitted";
  durationSec: number;
  startedAt: string | null;
  deadline: string | null;
  room: { code: string; title: string; status: string; startedAt: string | null } | null;
  answers: Record<string, number>;
};

export default function ExamClient({ attemptId, questions }: { attemptId: string; questions: PublicQuestion[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedAttempt | null | undefined>(undefined);
  const [state, setState] = useState<AttemptState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
    setSaved(load<SavedAttempt | null>(attemptKey(attemptId), null));
  }, [attemptId]);

  const refresh = useCallback(async () => {
    if (!saved) return;
    try {
      const st = await api<AttemptState>(`/api/attempts/${attemptId}`, { attemptToken: saved.token });
      if (st.status === "submitted") {
        router.replace(`/exam/${attemptId}/result`);
        return;
      }
      setState(st);
    } catch (e) {
      setError((e as ApiError).message);
    }
  }, [saved, attemptId, router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- โหลดสถานะครั้งแรกเมื่อได้ token
    if (saved) void refresh();
  }, [saved, refresh]);

  if (saved === null) {
    return (
      <Result
        status="warning"
        title="ไม่พบข้อมูลผู้สอบในเครื่องนี้"
        subTitle="ถ้าเข้าห้องสอบจากเครื่องอื่น ให้กลับไปหน้าแรกแล้วกรอกรหัสห้องกับรหัสผู้สอบ"
        extra={<Link href="/"><Button type="primary">กลับหน้าแรก</Button></Link>}
      />
    );
  }
  if (error && !state) {
    return (
      <Result
        status="error"
        title={error}
        extra={<Button type="primary" onClick={() => { setError(null); void refresh(); }}>ลองอีกครั้ง</Button>}
      />
    );
  }
  if (!saved || !state) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Spin size="large" />
      </div>
    );
  }
  if (state.status === "waiting") {
    return <WaitingRoom state={state} onRefresh={refresh} />;
  }
  return <ExamRunner state={state} token={saved.token} questions={questions} />;
}

// ── ห้องรอสอบ ────────────────────────────────────────────────────────────────
function WaitingRoom({ state, onRefresh }: { state: AttemptState; onRefresh: () => Promise<void> }) {
  const code = state.room!.code;

  useEffect(() => {
    const channel = realtime()
      .channel(roomTopic(code), { config: { presence: { key: state.id } } })
      .on("broadcast", { event: "start" }, () => void onRefresh())
      .on("broadcast", { event: "end" }, () => void onRefresh())
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void channel.track({ id: state.id, name: state.name });
          void onRefresh(); // เผื่อครูกดเริ่มไปก่อนที่เราจะเชื่อมต่อทัน
        }
      });
    // สำรอง: ถ้า realtime ใช้ไม่ได้ ก็ยังเริ่มสอบได้จากการถามสถานะเป็นระยะ
    const poll = setInterval(() => void onRefresh(), 4000);
    return () => {
      clearInterval(poll);
      void realtime().removeChannel(channel);
    };
  }, [code, state.id, state.name, onRefresh]);

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <Card className="w-full max-w-lg text-center shadow-sm">
        <div className="mb-6 flex justify-center">
          <Brand />
        </div>
        <Spin size="large" />
        <h1 className="mt-5 mb-1 text-xl font-bold">รอครูคุมสอบกดเริ่มสอบ</h1>
        <p className="mb-6 text-slate-500">{state.room!.title}</p>
        <div className="mb-6 grid grid-cols-2 gap-3 text-left">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs text-slate-500">ชื่อผู้สอบ</div>
            <div className="font-semibold">{state.name}</div>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="text-xs text-slate-500">ลำดับที่นั่ง</div>
            <div className="font-semibold">{String(state.seatNo).padStart(3, "0")}</div>
          </div>
          <div className="col-span-2 rounded-lg border border-dashed border-amber-400 bg-amber-50 p-3">
            <div className="text-xs text-slate-600">รหัสผู้สอบ (จดไว้ ใช้กลับเข้าห้องจากเครื่องอื่นได้)</div>
            <div className="font-mono text-2xl font-bold tracking-[0.3em] text-slate-900">{state.examCode}</div>
          </div>
        </div>
        <ul className="m-0 space-y-1 pl-5 text-left text-sm text-slate-600">
          <li>ข้อสอบ {TOTAL_QUESTIONS} ข้อ เวลา {Math.round(state.durationSec / 60)} นาที ทุกคนเริ่มและหมดเวลาพร้อมกัน</li>
          <li>คำตอบบันทึกอัตโนมัติทุกครั้งที่เลือก เปลี่ยนคำตอบได้จนกว่าจะส่ง</li>
          <li>เมื่อหมดเวลา ระบบจะส่งข้อสอบให้อัตโนมัติ</li>
        </ul>
      </Card>
    </div>
  );
}

// ── หน้าทำข้อสอบ ─────────────────────────────────────────────────────────────
function ExamRunner({ state, token, questions }: { state: AttemptState; token: string; questions: PublicQuestion[] }) {
  const router = useRouter();
  const { modal, message } = App.useApp();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flags, setFlags] = useState<Set<number>>(new Set());
  const [sync, setSync] = useState<SyncState>("saved");
  const [navOpen, setNavOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const queueRef = useRef<AnswerQueue | null>(null);
  const finishingRef = useRef(false);
  const confirmRef = useRef<{ destroy: () => void } | null>(null);

  const deadline = useMemo(() => new Date(state.deadline!).getTime(), [state.deadline]);
  const ranges = useMemo(() => groupRanges(questions), [questions]);

  const finish = useCallback(
    async (reason: "manual" | "timeup" | "ended") => {
      if (finishingRef.current) return;
      finishingRef.current = true;
      setFinishing(true);
      if (reason !== "manual") confirmRef.current?.destroy();
      if (reason === "timeup") message.info("หมดเวลาสอบ ระบบกำลังส่งข้อสอบ");
      if (reason === "ended") message.info("ครูคุมสอบจบการสอบแล้ว");
      const queue = queueRef.current;
      if (queue && reason !== "ended") await queue.flush(reason === "timeup" ? 5000 : 10000);
      queue?.stop();
      try {
        await api(`/api/attempts/${state.id}/submit`, { method: "POST", attemptToken: token });
        remove(pendingKey(state.id));
        router.replace(`/exam/${state.id}/result`);
      } catch (e) {
        finishingRef.current = false;
        setFinishing(false);
        message.error((e as ApiError).message);
      }
    },
    [message, router, state.id, token],
  );

  // เริ่มคิวบันทึกคำตอบ + รวมคำตอบจาก server กับคำตอบที่ค้างในเครื่อง
  useEffect(() => {
    const queue = new AnswerQueue(state.id, token, setSync, (err) => {
      if (err.code === "time_up" || err.code === "not_running") void finish("timeup");
      else message.error(err.message);
    });
    queueRef.current = queue;
    const merged: Record<number, number> = {};
    for (const [q, c] of Object.entries(state.answers)) merged[Number(q)] = c;
    for (const [q, c] of queue.pendingAnswers()) {
      if (c === null) delete merged[q];
      else merged[q] = c;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ตั้งค่าเริ่มต้นจากข้อมูลที่โหลดมา
    setAnswers(merged);
    setFlags(new Set(load<number[]>(flagsKey(state.id), [])));
    const firstUnanswered = questions.findIndex((q) => merged[q.n] === undefined);
    setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
    return () => queue.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- สร้างคิวครั้งเดียวต่อการสอบ
  }, [state.id, token]);

  // ห้องสอบ: แสดงสถานะออนไลน์ให้ครูเห็น + รับสัญญาณ "จบการสอบ"
  useEffect(() => {
    if (!state.room) return;
    const channel = realtime()
      .channel(roomTopic(state.room.code), { config: { presence: { key: state.id } } })
      .on("broadcast", { event: "end" }, () => void finish("ended"))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ id: state.id, name: state.name });
      });
    return () => void realtime().removeChannel(channel);
  }, [state.room, state.id, state.name, finish]);

  // สำรอง: ถ้าสัญญาณ "จบการสอบ" จาก realtime ไม่มาถึง ก็ยังรู้ได้จากการถามสถานะเป็นระยะ
  useEffect(() => {
    if (!state.room) return;
    const id = setInterval(() => {
      api<{ status: string }>(`/api/attempts/${state.id}`, { attemptToken: token })
        .then((st) => {
          if (st.status === "submitted") void finish("ended");
        })
        .catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [state.room, state.id, token, finish]);

  // เตือนก่อนปิดแท็บถ้ายังมีคำตอบที่ยังไม่ถึง server
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (sync !== "saved") e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [sync]);

  const q = questions[index];

  const choose = useCallback((n: number, choice: number | null) => {
    setAnswers((prev) => {
      const next = { ...prev };
      if (choice === null) delete next[n];
      else next[n] = choice;
      return next;
    });
    queueRef.current?.set(n, choice);
  }, []);

  const toggleFlag = useCallback(
    (n: number) => {
      setFlags((prev) => {
        const next = new Set(prev);
        if (next.has(n)) next.delete(n);
        else next.add(n);
        save(flagsKey(state.id), [...next]);
        return next;
      });
    },
    [state.id],
  );

  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(questions.length - 1, i)));
      setNavOpen(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    [questions.length],
  );

  // คีย์ลัด: ← → เปลี่ยนข้อ, 1–5 เลือกคำตอบ
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey) return;
      if (e.key === "ArrowRight") go(index + 1);
      else if (e.key === "ArrowLeft") go(index - 1);
      else if (/^[1-5]$/.test(e.key)) choose(questions[index].n, Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, go, choose, questions]);

  const answeredCount = Object.keys(answers).length;
  const confirmSubmit = () => {
    const missing = TOTAL_QUESTIONS - answeredCount;
    confirmRef.current = modal.confirm({
      title: "ยืนยันการส่งข้อสอบ",
      icon: <SendOutlined />,
      content: (
        <div className="space-y-1">
          <p>ตอบแล้ว {answeredCount} จาก {questions.length} ข้อ</p>
          {missing > 0 && <p className="text-red-600">ยังไม่ได้ตอบ {missing} ข้อ</p>}
          {flags.size > 0 && <p className="text-amber-600">ทำเครื่องหมายไว้ทบทวน {flags.size} ข้อ</p>}
          <p className="text-slate-500">ส่งแล้วจะแก้คำตอบไม่ได้</p>
        </div>
      ),
      okText: "ส่งข้อสอบ",
      cancelText: "กลับไปทำต่อ",
      onOk: () => finish("manual"),
    });
  };

  const std = STANDARDS[q.std - 1];
  const range = q.group ? ranges.get(q.group) : undefined;

  return (
    <div className="min-h-screen pb-24 lg:pb-8">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2">
          <div className="hidden md:block">
            <Brand compact />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate font-semibold">{state.name}</div>
            <div className="text-xs text-slate-500">
              รหัสผู้สอบ <span className="font-mono">{state.examCode}</span>
              {state.room && <> · {state.room.title}</>}
            </div>
          </div>
          <SyncBadge state={sync} />
          <Countdown deadline={deadline} onExpire={() => void finish("timeup")} />
          <Button type="primary" icon={<SendOutlined />} onClick={confirmSubmit} loading={finishing}>
            <span className="hidden sm:inline">ส่งข้อสอบ</span>
          </Button>
        </div>
        <div className="h-1 bg-slate-100">
          <div className="h-1 bg-blue-900 transition-all" style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[1fr_340px]">
        <Card className="shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-lg font-bold text-slate-900">ข้อ {q.n}</span>
            <span className="text-slate-400">/ {questions.length}</span>
            <Tag color="blue" className="m-0">
              มาตรฐานที่ {q.std} · {std.short}
            </Tag>
            <div className="flex-1" />
            <Button
              size="small"
              icon={flags.has(q.n) ? <FlagFilled className="text-amber-500" /> : <FlagOutlined />}
              onClick={() => toggleFlag(q.n)}
            >
              {flags.has(q.n) ? "ทำเครื่องหมายแล้ว" : "ทำเครื่องหมายไว้ทบทวน"}
            </Button>
          </div>

          {q.scenario && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              {range && (
                <div className="mb-2 text-xs font-semibold text-blue-900">
                  สถานการณ์ต่อไปนี้ใช้ตอบข้อ {range.from}–{range.to}
                </div>
              )}
              <p className="m-0 leading-relaxed whitespace-pre-line text-slate-700">{q.scenario}</p>
            </div>
          )}

          <p className="mb-4 text-base leading-relaxed font-medium whitespace-pre-line text-slate-900">{q.stem}</p>

          <Radio.Group
            vertical
            className="w-full"
            value={answers[q.n] ?? null}
            onChange={(e) => choose(q.n, e.target.value as number)}
          >
            {q.options.map((opt, i) => (
              <Radio
                key={i}
                value={i}
                className={`m-0 mb-2 flex w-full items-start rounded-lg border p-3 transition-colors ${
                  answers[q.n] === i ? "border-blue-900 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
                }`}
              >
                <span className="leading-relaxed">
                  <b className="mr-1">{CHOICE_LABELS[i]}.</b>
                  {opt}
                </span>
              </Radio>
            ))}
          </Radio.Group>

          <div className="mt-2 flex items-center justify-between gap-2">
            <Button icon={<LeftOutlined />} disabled={index === 0} onClick={() => go(index - 1)}>
              ข้อก่อนหน้า
            </Button>
            {answers[q.n] !== undefined && (
              <Button type="text" size="small" className="text-slate-500" onClick={() => choose(q.n, null)}>
                ล้างคำตอบ
              </Button>
            )}
            {index < questions.length - 1 ? (
              <Button type="primary" ghost onClick={() => go(index + 1)}>
                ข้อถัดไป <RightOutlined />
              </Button>
            ) : (
              <Button type="primary" icon={<SendOutlined />} onClick={confirmSubmit}>
                ส่งข้อสอบ
              </Button>
            )}
          </div>
          <p className="mt-4 mb-0 hidden text-xs text-slate-400 lg:block">คีย์ลัด: ← → เปลี่ยนข้อ · 1–5 เลือกคำตอบ ก–จ</p>
        </Card>

        <aside className="hidden lg:block">
          <Card className="sticky top-20 shadow-sm" title={`ตอบแล้ว ${answeredCount}/${questions.length} ข้อ`} size="small">
            <QuestionNavigator questions={questions} current={index} answers={answers} flags={flags} onJump={go} />
          </Card>
        </aside>
      </main>

      {/* แถบล่างสำหรับมือถือ */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t border-slate-200 bg-white p-3 lg:hidden">
        <Button icon={<LeftOutlined />} disabled={index === 0} onClick={() => go(index - 1)} />
        <Button block icon={<AppstoreOutlined />} onClick={() => setNavOpen(true)}>
          ข้อ {q.n} · ตอบแล้ว {answeredCount}/{questions.length}
        </Button>
        <Button icon={<RightOutlined />} disabled={index === questions.length - 1} onClick={() => go(index + 1)} />
      </div>
      <Drawer title="เลือกข้อ" placement="bottom" size="large" open={navOpen} onClose={() => setNavOpen(false)}>
        <QuestionNavigator questions={questions} current={index} answers={answers} flags={flags} onJump={go} />
      </Drawer>
    </div>
  );
}

function SyncBadge({ state }: { state: SyncState }) {
  if (state === "saved")
    return (
      <Tooltip title="คำตอบทั้งหมดบันทึกถึงเซิร์ฟเวอร์แล้ว">
        <Tag color="success" icon={<CheckCircleFilled />} className="m-0 hidden sm:inline-flex">
          บันทึกแล้ว
        </Tag>
      </Tooltip>
    );
  if (state === "saving")
    return (
      <Tag color="processing" icon={<CloudSyncOutlined />} className="m-0 hidden sm:inline-flex">
        กำลังบันทึก
      </Tag>
    );
  return (
    <Tooltip title="เชื่อมต่อไม่ได้ชั่วคราว คำตอบถูกเก็บไว้ในเครื่องและจะส่งให้อัตโนมัติ">
      <Tag color="warning" icon={<WarningFilled />} className="m-0">
        ออฟไลน์ กำลังลองใหม่
      </Tag>
    </Tooltip>
  );
}
