import { HomeworkPageClient } from "@/features/homework-page-client";

export default async function HomeworkPage({
  params
}: {
  params: Promise<{ day: string }>;
}) {
  const { day } = await params;
  return <HomeworkPageClient day={Number(day)} />;
}
