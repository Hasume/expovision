import { z } from "zod";

export const trackCodeSchema = z.enum(["A", "B", "C"]);
export const languageCodeSchema = z.enum(["ru", "en"]);

export const onboardingAnswersSchema = z.object({
  level: z.enum(["newbie", "chatgpt_tried", "coded_before"]),
  interest: z.enum(["it_professions", "ai_in_work", "build_product"]),
  dailyTime: z.enum(["30m", "1h", "2h_plus"]),
  goal: z.enum(["understand_market", "build_ai_scenarios", "build_mvp"]),
  experience: z.array(z.enum(["chatgpt", "figma", "coding", "none"])).min(1)
});

export const profileResultSchema = z.object({
  profileLabel: z.string().min(1),
  recommendedTrack: trackCodeSchema
});

export const authSignupRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  language: languageCodeSchema
});

export const authLoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const authTokenPairSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1)
});

export const meResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  startedAt: z.string().nullable(),
  timezone: z.string(),
  selectedTrack: trackCodeSchema.nullable(),
  language: languageCodeSchema,
  role: z.enum(["student", "admin"])
});

export const dashboardResponseSchema = z.object({
  currentDay: z.number().int().min(1).max(14),
  progressPercent: z.number().int().min(0).max(100),
  todayFocus: z.string(),
  message: z.string(),
  splitAvailable: z.boolean(),
  reportCompleted: z.boolean(),
  mapUnlocked: z.boolean(),
  weekOneWebinars: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().optional(),
      day: z.number().int().min(1).max(14),
      joinUrl: z.string().url(),
      startsAtIso: z.string().nullable().optional(),
      durationMinutes: z.number().optional(),
      unlocked: z.boolean(),
      programOrder: z.number().nullable().optional(),
    })
  ),
  trackSelected: trackCodeSchema.nullable()
});

export const lessonCardSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: z.enum(["mandatory", "optional"]),
  status: z.enum(["locked", "available", "completed"])
});

export const curriculumDayResponseSchema = z.object({
  dayNumber: z.number().int().min(1).max(14),
  track: trackCodeSchema.nullable(),
  lessons: z.array(lessonCardSchema),
  artifactTitle: z.string()
});

export const markLessonDoneRequestSchema = z.object({
  lessonId: z.string().min(1)
});

export const homeworkTemplateResponseSchema = z.object({
  dayNumber: z.number().int().min(1).max(14),
  instructionMd: z.string(),
  sampleMd: z.string(),
  minLength: z.number().int().min(1)
});

export const submitHomeworkRequestSchema = z.object({
  dayNumber: z.number().int().min(1).max(14),
  answerText: z.string().min(20)
});

export const trackSelectionRequestSchema = z.object({
  track: trackCodeSchema
});

export const finalResultResponseSchema = z.object({
  achievements: z.array(z.string()),
  outcomeType: z.enum(["roadmap", "ai_toolkit", "mvp_case"]),
  nextSteps: z.array(z.string()).length(3)
});

export const lessonDetailsResponseSchema = z.object({
  id: z.string().min(1),
  dayNumber: z.number().int().min(1).max(14),
  title: z.string().min(1),
  videoUrl: z.string().url(),
  kinescopeEmbedUrl: z.string().url().nullable(),
  content: z.string().min(1),
  kind: z.enum(["mandatory", "optional"]),
  images: z.array(
    z.object({
      url: z.string().url(),
      caption: z.string().nullable()
    })
  ),
  homework: z
    .object({
      templateId: z.string().min(1),
      instruction: z.string().min(1),
      sample: z.string().min(1),
      minLength: z.number().int().min(1)
    })
    .nullable(),
  artifacts: z.array(
    z.object({
      title: z.string(),
      resourceUrl: z.string()
    })
  ),
  lessonCompleted: z.boolean(),
  dayLessons: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string(),
      kind: z.enum(["mandatory", "optional"]),
      completed: z.boolean(),
      isCurrent: z.boolean(),
      locked: z.boolean()
    })
  )
});

export const submitHomeworkResponseSchema = z.object({
  success: z.literal(true),
  dueAt: z.string().datetime(),
  status: z.enum(["pending_review", "overdue"])
});

export const myHomeworkSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  dayNumber: z.number().int().min(1).max(14),
  status: z.enum(["pending_review", "approved", "rejected", "overdue"]),
  dueAt: z.string().datetime(),
  reviewComment: z.string().nullable(),
  reviewedAt: z.string().nullable()
});

export const pushSubscribeRequestSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1)
});

export const activateLicenseRequestSchema = z.object({
  email: z.string().email(),
  token: z.string().min(8),
  password: z.string().min(8),
  language: languageCodeSchema
});

export const completeInitialReportResponseSchema = z.object({
  success: z.literal(true),
  mapUnlocked: z.boolean()
});

export const adminSetIntensiveStartRequestSchema = z.object({
  startAtIso: z.string().datetime()
});

export const adminGenerateTokensRequestSchema = z.object({
  count: z.number().int().min(1),
  intensiveStartAt: z.string().datetime()
});

export const adminReportResponseSchema = z.object({
  totalUsers: z.number().int().min(0),
  reportCompletedUsers: z.number().int().min(0),
  trackDistribution: z.object({
    A: z.number().int().min(0),
    B: z.number().int().min(0),
    C: z.number().int().min(0)
  }),
  totalTokens: z.number().int().min(0),
  usedTokens: z.number().int().min(0),
  pendingHomeworkReviews: z.number().int().min(0),
  overdueHomework: z.number().int().min(0),
  intensiveStartAt: z.string().datetime()
});

export const adminAuditLogSchema = z.object({
  id: z.string().min(1),
  action: z.string().min(1),
  endpoint: z.string().min(1),
  method: z.string().min(1),
  payloadJson: z.string().min(1),
  createdAt: z.string().datetime()
});

export const curatorPendingItemSchema = z.object({
  submissionId: z.string().min(1),
  userId: z.string().uuid(),
  dayNumber: z.number().int().min(1).max(14),
  answerText: z.string().min(1),
  dueAt: z.string().datetime()
});

export const curatorReviewRequestSchema = z.object({
  submissionId: z.string().min(3),
  verdict: z.enum(["approved", "rejected"]),
  comment: z.string().min(2)
});

export const curatorReviewResponseSchema = z.object({
  success: z.literal(true),
  status: z.enum(["approved", "rejected", "overdue"])
});

export type TrackCode = z.infer<typeof trackCodeSchema>;
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;
export type ProfileResult = z.infer<typeof profileResultSchema>;
export type AuthSignupRequest = z.infer<typeof authSignupRequestSchema>;
export type AuthLoginRequest = z.infer<typeof authLoginRequestSchema>;
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type CurriculumDayResponse = z.infer<typeof curriculumDayResponseSchema>;
export type HomeworkTemplateResponse = z.infer<typeof homeworkTemplateResponseSchema>;
export type SubmitHomeworkRequest = z.infer<typeof submitHomeworkRequestSchema>;
export type SubmitHomeworkResponse = z.infer<typeof submitHomeworkResponseSchema>;
export type MyHomeworkSubmission = z.infer<typeof myHomeworkSubmissionSchema>;
export type TrackSelectionRequest = z.infer<typeof trackSelectionRequestSchema>;
export type FinalResultResponse = z.infer<typeof finalResultResponseSchema>;
export type LessonDetailsResponse = z.infer<typeof lessonDetailsResponseSchema>;
export type ActivateLicenseRequest = z.infer<typeof activateLicenseRequestSchema>;
export type CompleteInitialReportResponse = z.infer<typeof completeInitialReportResponseSchema>;
export type AdminSetIntensiveStartRequest = z.infer<typeof adminSetIntensiveStartRequestSchema>;
export type AdminGenerateTokensRequest = z.infer<typeof adminGenerateTokensRequestSchema>;
export type AdminReportResponse = z.infer<typeof adminReportResponseSchema>;
export type AdminAuditLog = z.infer<typeof adminAuditLogSchema>;
export type CuratorPendingItem = z.infer<typeof curatorPendingItemSchema>;
export type CuratorReviewRequest = z.infer<typeof curatorReviewRequestSchema>;
export type CuratorReviewResponse = z.infer<typeof curatorReviewResponseSchema>;
