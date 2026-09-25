"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

// ใส่ไฟล์โลโก้ไว้ที่ public/logo.png แล้วจะแสดงแทนตราตัวอักษรอัตโนมัติ
export function Brand({ compact = false }: { compact?: boolean }) {
  const [hasLogo, setHasLogo] = useState(true);
  const size = compact ? 36 : 48;
  return (
    <Link href="/" className="flex items-center gap-3 text-inherit no-underline">
      {hasLogo ? (
        <Image
          src="/logo.png"
          alt="โลโก้"
          width={size}
          height={size}
          className="object-contain"
          onError={() => setHasLogo(false)}
          unoptimized
          priority
        />
      ) : (
        <span
          className="grid shrink-0 place-items-center rounded-full bg-blue-900 font-bold text-amber-300"
          style={{ width: size, height: size }}
        >
          ครู
        </span>
      )}
      <span className="leading-tight">
        <span className={`block font-semibold text-slate-900 ${compact ? "text-base" : "text-lg"}`}>
          ข้อสอบจำลอง วิชาครู
        </span>
        {!compact && (
          <span className="hidden text-xs text-slate-500 sm:block">ตามผังการสร้างแบบทดสอบ วิชาครู พ.ศ. 2566</span>
        )}
      </span>
    </Link>
  );
}

export function Disclaimer() {
  return (
    <p className="mx-auto max-w-3xl px-4 py-6 text-center text-xs text-slate-500">
      เว็บฝึกซ้อมที่จัดทำขึ้นเอง ไม่ใช่ระบบของสำนักงานเลขาธิการคุรุสภา ข้อสอบทั้งหมดแต่งขึ้นใหม่ตามผังการสร้างแบบทดสอบ
      วิชาครู พ.ศ. 2566 ไม่ใช่ข้อสอบจริง
    </p>
  );
}
