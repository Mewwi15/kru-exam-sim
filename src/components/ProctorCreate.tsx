"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { App, Button, Card, Form, Input, InputNumber, List, Tag } from "antd";
import { HomeOutlined, PlusOutlined, RightOutlined } from "@ant-design/icons";
import { Brand, Disclaimer } from "./Brand";
import { api, ApiError } from "@/lib/api";
import { DEFAULT_DURATION_MIN } from "@/lib/exam-meta";
import { load, save, teacherKey, teacherRoomsKey } from "@/lib/storage";

type SavedRoom = { code: string; title: string; createdAt: string };

export default function ProctorCreate() {
  const router = useRouter();
  const { message } = App.useApp();
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<SavedRoom[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่าน localStorage ได้หลัง mount เท่านั้น
    setRooms(load<SavedRoom[]>(teacherRoomsKey, []));
  }, []);

  const create = async (values: { title: string; durationMin: number }) => {
    setBusy(true);
    try {
      const res = await api<{ code: string; teacherToken: string; title: string }>("/api/rooms", { body: values });
      save(teacherKey(res.code), res.teacherToken);
      save(teacherRoomsKey, [{ code: res.code, title: res.title, createdAt: new Date().toISOString() }, ...rooms].slice(0, 20));
      router.push(`/proctor/${res.code}`);
    } catch (e) {
      message.error((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Brand />
          <Link href="/">
            <Button icon={<HomeOutlined />}>หน้าแรก</Button>
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-4xl gap-5 px-4 py-6 md:grid-cols-2">
        <Card title="สร้างห้องสอบ (ครูคุมสอบ)" className="shadow-sm">
          <ol className="mb-5 space-y-1 pl-5 text-sm text-slate-600">
            <li>สร้างห้อง แล้วแจกรหัสห้อง 6 หลักหรือ QR ให้นักเรียน</li>
            <li>นักเรียนกรอกชื่อ + รหัสห้อง แล้วรอในห้อง</li>
            <li>กด &ldquo;เริ่มสอบพร้อมกัน&rdquo; ทุกคนจะเริ่มพร้อมกันและหมดเวลาพร้อมกัน</li>
            <li>ระหว่างสอบ ครูเห็นได้ทันทีว่าใครตอบข้อไหน ถูกหรือผิด</li>
          </ol>
          <Form layout="vertical" requiredMark={false} onFinish={create} initialValues={{ title: "", durationMin: DEFAULT_DURATION_MIN }}>
            <Form.Item name="title" label="ชื่อห้องสอบ" rules={[{ max: 80 }]}>
              <Input size="large" placeholder="เช่น ติวสอบใบประกอบฯ รุ่น 66" maxLength={80} />
            </Form.Item>
            <Form.Item name="durationMin" label="เวลาสอบ (นาที)" rules={[{ required: true }]} extra="ข้อสอบจริงใช้เวลา 180 นาที">
              <InputNumber size="large" min={1} max={360} className="w-full" />
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block icon={<PlusOutlined />} loading={busy}>
              สร้างห้องสอบ
            </Button>
          </Form>
        </Card>
        <Card title="ห้องที่สร้างจากเครื่องนี้" className="h-fit shadow-sm" styles={{ body: { padding: rooms.length ? 0 : undefined } }}>
          {rooms.length === 0 ? (
            <p className="m-0 text-slate-500">ยังไม่มีห้องสอบ</p>
          ) : (
            <List
              dataSource={rooms}
              renderItem={(r) => (
                <List.Item className="px-4" actions={[<Link key="open" href={`/proctor/${r.code}`}><Button size="small">เปิด <RightOutlined /></Button></Link>]}>
                  <List.Item.Meta
                    title={r.title}
                    description={
                      <span>
                        <Tag className="font-mono">{r.code}</Tag>
                        {new Date(r.createdAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Card>
      </main>
      <Disclaimer />
    </div>
  );
}
