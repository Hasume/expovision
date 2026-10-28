import { LessonPageClient } from "@/features/lesson-page-client";

export default async function LessonPage({
  params
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = await params;
  return <LessonPageClient lessonId={lessonId} />;
}
