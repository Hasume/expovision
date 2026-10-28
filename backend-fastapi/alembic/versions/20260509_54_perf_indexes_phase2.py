"""Performance indexes phase 2: community hot-path queries.

Existing UNIQUE constraints already cover:
  IntensiveFlowMember(userId, isActive)  → ux_IntensiveFlowMember_user_active
  HomeworkSubmission(userId, templateId) → ux_homework_submission_user_template
  HomeworkDraftState(userId, dayNumber)  → ux_homework_draft_state_user_day
  LessonAiFluencyState(userId, lessonId) → ux_lesson_ai_fluency_state_user_lesson (leading col)
  CommunityVote PK                       → (userId, targetType, targetId)
  CommunityChatMessage(chatId,createdAt) → idx_chat_message_chat_active (WHERE deletedAt IS NULL)

Only truly missing indexes are added here.
"""

from alembic import op

revision = "20260509_54"
down_revision = "20260509_53"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # community_feed ORDER BY isPinned DESC, closesAt DESC WHERE status='closed'
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_CommunityTopic_status_pinned_closes"
        ON "CommunityTopic" ("status", "isPinned" DESC, "closesAt" DESC)
        """
    )

    # list_topics with authorId + status filter (profile/moderation)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_CommunityTopic_authorId_status"
        ON "CommunityTopic" ("authorId", "status", "createdAt" DESC)
        """
    )

    # _batch_preview_replies / _batch_participants_for_cards: ORDER BY topicId, createdAt
    # (strengthens existing idx_community_reply_topic by adding createdAt)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_CommunityReply_topicId_createdAt"
        ON "CommunityReply" ("topicId", "createdAt" ASC)
        """
    )

    # from_followed feed EXISTS(followerId=? AND followingId=authorId) composite lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_CommunityFollow_followerId_followingId"
        ON "CommunityFollow" ("followerId", "followingId")
        """
    )

    # _is_community_admin: JOIN on LOWER(email) — function index avoids seq-scan
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS "ix_CommunityUser_email_lower"
        ON "CommunityUser" (LOWER("email"))
        """
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "ix_CommunityTopic_status_pinned_closes"')
    op.execute('DROP INDEX IF EXISTS "ix_CommunityTopic_authorId_status"')
    op.execute('DROP INDEX IF EXISTS "ix_CommunityReply_topicId_createdAt"')
    op.execute('DROP INDEX IF EXISTS "ix_CommunityFollow_followerId_followingId"')
    op.execute('DROP INDEX IF EXISTS "ix_CommunityUser_email_lower"')
