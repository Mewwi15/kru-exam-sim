import ExamClient from "@/components/ExamClient";
import { PUBLIC_QUESTIONS } from "@/server/questions";

// ส่งเฉพาะตัวข้อสอบ (ไม่มีเฉลย) ไปที่เบราว์เซอร์ การตรวจคำตอบทำที่ server เท่านั้น
export default async function ExamPage({ params }: PageProps<"/exam/[id]">) {
  const { id } = await params;
  return <ExamClient attemptId={id} questions={PUBLIC_QUESTIONS} />;
}
