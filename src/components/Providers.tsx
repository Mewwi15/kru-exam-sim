"use client";

import { App, ConfigProvider } from "antd";
import thTH from "antd/locale/th_TH";

export const BRAND = "#1e3a8a";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={thTH}
      theme={{
        token: {
          colorPrimary: BRAND,
          borderRadius: 10,
          fontFamily: "var(--font-thai), ui-sans-serif, system-ui, sans-serif",
          fontSize: 15,
        },
        components: {
          Radio: { radioSize: 18 },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
