"use client";

import { useEffect, useRef, useState } from "react";
import { ClockCircleOutlined } from "@ant-design/icons";
import { serverNow } from "@/lib/api";
import { formatDuration } from "@/lib/exam-meta";

// นาฬิกานับถอยหลังตามเวลา server แยกเป็น component เดียว ส่วนอื่นของหน้าจึงไม่ต้อง render ใหม่ทุกวินาที
export function Countdown({
  deadline,
  onExpire,
  warnBelowSec = 600,
  label = "เหลือเวลา",
}: {
  deadline: number;
  onExpire?: () => void;
  warnBelowSec?: number;
  label?: string;
}) {
  const [left, setLeft] = useState(() => Math.max(0, (deadline - serverNow()) / 1000));
  const expired = useRef(false);
  const onExpireRef = useRef(onExpire);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    expired.current = false;
    const tick = () => {
      const sec = Math.max(0, (deadline - serverNow()) / 1000);
      setLeft(sec);
      if (sec <= 0 && !expired.current) {
        expired.current = true;
        onExpireRef.current?.();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline]);

  const warn = left <= warnBelowSec;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-lg font-semibold tabular-nums ${
        warn ? "animate-pulse bg-red-50 text-red-600" : "bg-blue-50 text-blue-900"
      }`}
      aria-live="polite"
    >
      <ClockCircleOutlined />
      <span className="hidden font-sans text-sm font-normal sm:inline">{label}</span>
      {formatDuration(Math.ceil(left))}
    </div>
  );
}
