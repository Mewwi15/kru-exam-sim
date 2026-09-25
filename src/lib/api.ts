// ตัวช่วยเรียก API + ปรับนาฬิกาให้ตรงกับ server (ทุกเครื่องนับเวลาถอยหลังจากนาฬิกาเดียวกัน)

let clockOffset = 0; // เวลา server - เวลาเครื่องนี้ (ms)
let bestRtt = Number.POSITIVE_INFINITY;

export function serverNow(): number {
  return Date.now() + clockOffset;
}

function syncClock(serverTime: string | undefined, sentAt: number, receivedAt: number) {
  if (!serverTime) return;
  const rtt = receivedAt - sentAt;
  // ใช้ผลวัดที่ round-trip สั้นที่สุด เพราะคลาดเคลื่อนน้อยที่สุด
  if (rtt <= bestRtt + 30) {
    bestRtt = Math.min(bestRtt, rtt);
    clockOffset = new Date(serverTime).getTime() - (sentAt + rtt / 2);
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

type Options = {
  method?: "GET" | "POST";
  body?: unknown;
  attemptToken?: string;
  teacherToken?: string;
  signal?: AbortSignal;
  keepalive?: boolean;
};

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.attemptToken) headers["x-attempt-token"] = opts.attemptToken;
  if (opts.teacherToken) headers["x-teacher-token"] = opts.teacherToken;

  const sentAt = Date.now();
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      keepalive: opts.keepalive,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต", 0, "network");
  }
  const receivedAt = Date.now();
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string; serverNow?: string };
  if (!res.ok) throw new ApiError(data.error ?? "เกิดข้อผิดพลาด", res.status, data.code);
  syncClock(data.serverNow, sentAt, receivedAt);
  return data;
}
