// localStorage อาจใช้ไม่ได้ (โหมดส่วนตัว/ถูกบล็อก) ทุกการอ่านเขียนจึงห่อด้วย try/catch

const PREFIX = "kes:";

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // ignore
  }
}

export type SavedAttempt = { id: string; token: string; name: string; examCode: string; roomCode?: string };

export const attemptKey = (id: string) => `attempt:${id}`;
export const lastAttemptKey = "lastAttempt";
export const teacherKey = (code: string) => `teacher:${code}`;
export const teacherRoomsKey = "teacherRooms";
export const flagsKey = (id: string) => `flags:${id}`;
export const pendingKey = (id: string) => `pending:${id}`;
