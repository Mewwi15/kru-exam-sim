import ProctorDashboard from "@/components/ProctorDashboard";

export default async function ProctorRoomPage({ params, searchParams }: PageProps<"/proctor/[code]">) {
  const { code } = await params;
  const { t } = await searchParams;
  return <ProctorDashboard code={code} tokenFromUrl={typeof t === "string" ? t : undefined} />;
}
