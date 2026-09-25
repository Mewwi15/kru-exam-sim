"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Alert, App, Button, Card, Collapse, Descriptions, Form, Input, Segmented, Tag } from "antd";
import { ClockCircleOutlined, FileTextOutlined, TeamOutlined, UserOutlined } from "@ant-design/icons";
import { Brand, Disclaimer } from "./Brand";
import { Leaderboard, type BoardRow } from "./Leaderboard";
import { DEFAULT_DURATION_MIN, PASS_PERCENT, STANDARDS, TOTAL_QUESTIONS } from "@/lib/exam-meta";
import { api, ApiError } from "@/lib/api";
import { attemptKey, lastAttemptKey, load, save, type SavedAttempt } from "@/lib/storage";

type Mode = "solo" | "room";
type CreateRes = { attemptId: string; token: string; examCode: string; seatNo: number };

export default function Landing({ board, initialRoom }: { board: BoardRow[]; initialRoom?: string }) {
  const router = useRouter();
  const { message } = App.useApp();
  const [mode, setMode] = useState<Mode>(initialRoom ? "room" : "solo");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SavedAttempt | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    const saved = load<SavedAttempt | null>(lastAttemptKey, null);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
    setLast(saved);
    if (saved?.name) form.setFieldValue("name", saved.name);
  }, [form]);

  const remember = (a: SavedAttempt) => {
    save(attemptKey(a.id), a);
    save(lastAttemptKey, a);
  };

  const start = async (values: { name: string; roomCode?: string; examCode?: string }) => {
    setBusy(true);
    try {
      if (mode === "room" && values.examCode) {
        const res = await api<{ attemptId: string; token: string }>("/api/attempts/resume", {
          body: { roomCode: values.roomCode, examCode: values.examCode },
        });
        remember({ id: res.attemptId, token: res.token, name: values.name, examCode: values.examCode.toUpperCase(), roomCode: values.roomCode });
        router.push(`/exam/${res.attemptId}`);
        return;
      }
      const res = await api<CreateRes>("/api/attempts", {
        body: { name: values.name, roomCode: mode === "room" ? values.roomCode : undefined },
      });
      remember({ id: res.attemptId, token: res.token, name: values.name, examCode: res.examCode, roomCode: mode === "room" ? values.roomCode : undefined });
      router.push(`/exam/${res.attemptId}`);
    } catch (e) {
      message.error((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand />
          <Link href="/proctor">
            <Button icon={<TeamOutlined />}>
              <span className="hidden sm:inline">สำหรับครูคุมสอบ</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-5 px-4 py-6 lg:grid-cols-[1.25fr_1fr]">
        <Card className="shadow-sm">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Tag color="blue" className="m-0">การทดสอบด้านความรู้และประสบการณ์วิชาชีพ</Tag>
            <Tag color="gold" className="m-0">ปี 2569</Tag>
          </div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">ข้อสอบจำลอง วิชาครู</h1>
          <p className="mb-5 text-slate-600">
            ข้อสอบเชิงสถานการณ์ (Situation Based Testing) แบ่งตาม 5 มาตรฐานความรู้ สัดส่วนข้อตรงกับผังการสร้างแบบทดสอบของคุรุสภา
          </p>

          <Descriptions
            size="small"
            column={{ xs: 1, sm: 2 }}
            bordered
            className="mb-5"
            items={[
              { key: "n", label: <><FileTextOutlined /> จำนวน</>, children: `${TOTAL_QUESTIONS} ข้อ (ปรนัย 5 ตัวเลือก)` },
              { key: "t", label: <><ClockCircleOutlined /> เวลา</>, children: `${DEFAULT_DURATION_MIN / 60} ชั่วโมง` },
              { key: "p", label: "เกณฑ์ผ่าน", children: `ร้อยละ ${PASS_PERCENT} (${(PASS_PERCENT / 100) * TOTAL_QUESTIONS} ข้อขึ้นไป)` },
              { key: "r", label: "เฉลย", children: "ดูเฉลยพร้อมคำอธิบายได้หลังส่งข้อสอบ" },
            ]}
          />

          <Collapse
            size="small"
            defaultActiveKey={["std"]}
            items={[
              {
                key: "std",
                label: "โครงสร้างข้อสอบ 5 มาตรฐาน",
                children: (
                  <ol className="m-0 list-none space-y-2 p-0">
                    {STANDARDS.map((s) => (
                      <li key={s.std} className="flex items-start justify-between gap-3">
                        <span>
                          <b>มาตรฐานที่ {s.std}</b> {s.name}
                        </span>
                        <Tag className="m-0 shrink-0">{s.items} ข้อ</Tag>
                      </li>
                    ))}
                  </ol>
                ),
              },
            ]}
          />
        </Card>

        <div className="order-first flex flex-col gap-5 lg:order-none">
          <Card className="shadow-sm" title="เริ่มทำข้อสอบ">
            {last && (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                title={`มีการสอบของ "${last.name}" ค้างอยู่ในเครื่องนี้`}
                action={
                  <Button size="small" type="primary" onClick={() => router.push(`/exam/${last.id}`)}>
                    เปิดต่อ
                  </Button>
                }
              />
            )}
            <Segmented<Mode>
              block
              className="mb-4"
              value={mode}
              onChange={setMode}
              options={[
                { label: "สอบเดี่ยว", value: "solo", icon: <UserOutlined /> },
                { label: "เข้าห้องสอบ", value: "room", icon: <TeamOutlined /> },
              ]}
            />
            <Form form={form} layout="vertical" requiredMark={false} onFinish={start} initialValues={{ roomCode: initialRoom }}>
              <Form.Item
                name="name"
                label="ชื่อ-นามสกุลผู้สอบ"
                rules={[{ required: true, whitespace: true, message: "กรุณากรอกชื่อ" }, { max: 60 }]}
              >
                <Input size="large" placeholder="เช่น สมชาย ใจดี" autoComplete="name" maxLength={60} />
              </Form.Item>
              {mode === "room" && (
                <>
                  <Form.Item
                    name="roomCode"
                    label="รหัสห้องสอบ (ขอจากครูคุมสอบ)"
                    rules={[{ required: true, pattern: /^\d{6}$/, message: "รหัสห้องเป็นตัวเลข 6 หลัก" }]}
                  >
                    <Input.OTP length={6} size="large" formatter={(v) => v.replace(/\D/g, "")} />
                  </Form.Item>
                  <Form.Item
                    name="examCode"
                    label="รหัสผู้สอบ (กรอกเฉพาะเมื่อกลับเข้าห้องจากเครื่องอื่น)"
                    rules={[{ pattern: /^[A-Za-z0-9]{5}$/, message: "รหัสผู้สอบมี 5 ตัว" }]}
                  >
                    <Input size="large" placeholder="เว้นว่างได้" maxLength={5} className="uppercase" />
                  </Form.Item>
                </>
              )}
              <Button type="primary" htmlType="submit" size="large" block loading={busy}>
                {mode === "solo" ? "เริ่มสอบ (จับเวลาทันที)" : "เข้าห้องสอบ"}
              </Button>
            </Form>
          </Card>

          <Card className="shadow-sm" title="อันดับคะแนน (สอบเดี่ยว)" styles={{ body: { padding: 0 } }}>
            <Leaderboard rows={board.slice(0, 10)} size="small" />
          </Card>
        </div>
      </main>
      <Disclaimer />
    </div>
  );
}
