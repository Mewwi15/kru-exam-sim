import ResultClient from "@/components/ResultClient";

export default async function ResultPage({ params }: PageProps<"/exam/[id]/result">) {
  const { id } = await params;
  return <ResultClient attemptId={id} />;
}
