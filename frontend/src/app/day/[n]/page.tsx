import { DayDetailClient } from "@/features/day-detail-client";

export default async function DayPage({
  params,
}: {
  params: Promise<{ n: string }>;
}) {
  const { n } = await params;
  const dayNumber = parseInt(n, 10);
  return <DayDetailClient dayNumber={isNaN(dayNumber) ? 1 : dayNumber} />;
}
