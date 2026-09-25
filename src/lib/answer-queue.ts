import { api, ApiError } from "./api";
import { load, pendingKey, save } from "./storage";

export type SyncState = "saved" | "saving" | "retrying";

// คิวส่งคำตอบ: หน้าจอเปลี่ยนทันทีที่กด (ไม่รอเน็ต) แล้วค่อยส่งเบื้องหลัง
// - รวมคำตอบที่ค้างส่งทีเดียว, ข้อเดิมที่เปลี่ยนใจจะเหลือค่าล่าสุดค่าเดียว
// - เน็ตหลุดจะลองใหม่เรื่อย ๆ และเก็บคำตอบที่ยังไม่ถึง server ไว้ในเครื่อง (รีเฟรชแล้วไม่หาย)
export class AnswerQueue {
  private pending = new Map<number, number | null>();
  private inflight: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1000;
  private stopped = false;

  constructor(
    private attemptId: string,
    private token: string,
    private onState: (s: SyncState) => void,
    private onFatal: (err: ApiError) => void,
  ) {
    const saved = load<Record<string, number | null>>(pendingKey(attemptId), {});
    for (const [q, c] of Object.entries(saved)) this.pending.set(Number(q), c);
    if (this.pending.size) this.schedule(0);
  }

  /** คำตอบที่ยังไม่ได้ส่งถึง server (ใช้รวมกับคำตอบจาก server ตอนเปิดหน้าใหม่) */
  pendingAnswers(): Map<number, number | null> {
    return new Map(this.pending);
  }

  set(q: number, choice: number | null) {
    this.pending.set(q, choice);
    this.persist();
    this.onState("saving");
    this.schedule(120);
  }

  /** รอจนส่งครบ (ใช้ก่อนส่งข้อสอบ) */
  async flush(timeoutMs = 8000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (this.timer) {
        clearTimeout(this.timer);
        this.timer = null;
      }
      if (this.inflight) await this.inflight;
      else if (this.pending.size) await this.send();
      if (!this.pending.size && !this.inflight) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return this.pending.size === 0;
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private persist() {
    save(pendingKey(this.attemptId), Object.fromEntries(this.pending));
  }

  private schedule(delay: number) {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.send();
    }, delay);
  }

  private send(): Promise<void> {
    if (this.inflight || this.pending.size === 0 || this.stopped) return this.inflight ?? Promise.resolve();
    const batch = new Map(this.pending);
    const items = [...batch].map(([q, choice]) => ({ q, choice }));
    this.inflight = api(`/api/attempts/${this.attemptId}/answers`, {
      body: { items },
      attemptToken: this.token,
    })
      .then(() => {
        // ลบเฉพาะข้อที่ค่ายังเหมือนตอนส่ง (ถ้าผู้สอบเปลี่ยนใจระหว่างส่ง ให้ส่งค่าใหม่รอบถัดไป)
        for (const [q, c] of batch) if (this.pending.get(q) === c) this.pending.delete(q);
        this.persist();
        this.retryDelay = 1000;
        this.onState(this.pending.size ? "saving" : "saved");
      })
      .catch((err: ApiError) => {
        if (err.status === 409 || err.status === 404 || err.status === 401) {
          this.stop();
          this.onFatal(err);
          return;
        }
        this.onState("retrying");
        const delay = this.retryDelay;
        this.retryDelay = Math.min(this.retryDelay * 2, 8000);
        setTimeout(() => this.schedule(0), delay);
      })
      .finally(() => {
        this.inflight = null;
        if (this.pending.size && this.retryDelay === 1000) this.schedule(0);
      });
    return this.inflight;
  }
}
