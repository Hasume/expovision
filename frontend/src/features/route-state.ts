export type LessonStatus = "locked" | "available" | "completed";
export type TrackCode = "A" | "B" | "C";

export interface DashboardState {
  currentDay: number;
  progressPercent: number;
  todayFocus: string;
  trackSelected: TrackCode | null;
}

export function getCurrentDayFromStartDate(startDateIso: string, now = new Date()): number {
  const startedAt = new Date(startDateIso);
  const dayMs = 24 * 60 * 60 * 1000;
  const raw = Math.floor((now.getTime() - startedAt.getTime()) / dayMs) + 1;
  return Math.min(14, Math.max(1, raw));
}

export function shouldShowSplit(currentDay: number): boolean {
  return currentDay >= 7;
}

export function lessonStatus(params: {
  currentDay: number;
  lessonDay: number;
  selectedTrack: TrackCode | null;
  lessonTrack: TrackCode | null;
  completed: boolean;
}): LessonStatus {
  if (params.completed) return "completed";
  if (params.lessonDay > params.currentDay) return "locked";
  if (params.lessonDay <= 7 && params.lessonTrack === null) return "available";
  if (params.lessonDay >= 8 && params.selectedTrack !== null && params.lessonTrack === params.selectedTrack) return "available";
  return "locked";
}
