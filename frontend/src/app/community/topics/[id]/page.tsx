"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  type CommunityReply,
  type TopicDetail,
  type CommunityCategory,
  type UserProfile,
  communityCreateReply,
  communityDeleteReply,
  communityDeleteTopic,
  communityGetTopic,
  communityUpdateReply,
  communityApproveTopic,
  communityRejectTopic,
  communityPinTopic,
  communityStartDM,
  communityMeApi,
  communityCategories,
  communityTopics,
  communityGetProfile,
  getCommunityAuthState,
} from "@/features/api";
import { InlineAlert } from "@/shared/ui/components";
import {
  CommunityMarkdown,
  ReplyThread,
  AuthorAvatar,
  buildReplyTree,
  ContentLayout,
  XpBadge,
  formatRelative,
} from "@/features/community/components";
import {
  formatDateTimeShort,
  formatUntilDeadlineShort,
  isDeadlineUrgent,
  topicPublicSince,
} from "@/features/community/time";
import { extractTopicCoverUrl, bodyWithoutCoverMarkdown } from "@/features/community/topic-cover";
import { communityFeedTopicPath } from "@/features/community/topic-path";
import { isMaskedCommunityAuthor } from "@/features/community/is-masked-author";
import {
  QuestionMedia,
  QuestionActionBar,
  ReplyComposer,
  DiscussionRightPanel,
  DiscussionDetailSkeleton,
  sortReplyTree,
  type ReplySortMode,
} from "@/features/community/discussion-detail";
import { MarkdownComposer } from "@/features/community/MarkdownComposer";

function useCountdownFull(closesAt: string | null): { text: string | null; urgent: boolean } {
  const [result, setResult] = useState<{ text: string | null; urgent: boolean }>({ text: null, urgent: false });

  useEffect(() => {
    if (!closesAt) return;
    const update = () => {
      const diff = new Date(closesAt).getTime() - Date.now();
      if (diff <= 0) {
        setResult({ text: "время истекло", urgent: true });
        return;
      }
      setResult({
        text: formatUntilDeadlineShort(closesAt),
        urgent: isDeadlineUrgent(closesAt, 3),
      });
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [closesAt]);

  return result;
}

function PendingTopicBanner({
  isAdmin,
  onApprove,
  onReject,
}: {
  isAdmin: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="topic-banner topic-banner--pending hub-q-pending-banner">
      <div className="topic-banner-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
        </svg>
        <div>
          <div className="topic-banner-title">На модерации</div>
          <div className="topic-banner-sub">Тема станет видимой после одобрения</div>
        </div>
      </div>
      {isAdmin ? (
        <div className="topic-banner-actions">
          <button className="hub-btn-primary" style={{ fontSize: 13, padding: "7px 16px" }} type="button" onClick={onApprove}>
            Одобрить
          </button>
          <button className="hub-btn-ghost" style={{ fontSize: 13, padding: "7px 16px" }} type="button" onClick={onReject}>
            Отклонить
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function TopicPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : params?.id?.[0] ?? "";
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replyParentId, setReplyParentId] = useState<string | null>(null);
  const [replyAnon, setReplyAnon] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [editingReply, setEditingReply] = useState<CommunityReply | null>(null);
  const [editBody, setEditBody] = useState("");
  const [categories, setCategories] = useState<CommunityCategory[]>([]);
  const [authorProfile, setAuthorProfile] = useState<UserProfile | null | undefined>(undefined);
  const [similar, setSimilar] = useState<{ id: string; title: string }[]>([]);
  const [replySort, setReplySort] = useState<ReplySortMode>("best");
  const [composerExpanded, setComposerExpanded] = useState(true);
  const [imgLightbox, setImgLightbox] = useState(false);

  const composerRef = useRef<HTMLDivElement>(null);
  /** Single ref guards all admin/reply actions — only one can be in-flight at a time. */
  const actionInFlightRef = useRef(false);
  const router = useRouter();
  const pathname = usePathname();
  const openedFromFeed = pathname.startsWith("/community/post/");
  const listHref = openedFromFeed ? "/community/dashboard" : "/community/topics";
  const listBackLabel = openedFromFeed ? "К ленте" : "К вопросам";

  useEffect(() => {
    const auth = getCommunityAuthState();
    setCurrentUserId(auth?.userId ?? null);
    communityCategories({ suggested: !!auth }).then(setCategories).catch(() => {});
    if (auth) {
      communityMeApi().then((u) => setIsAdmin(u.isAdmin ?? false)).catch(() => {});
    }
  }, []);

  const loadTopic = useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    communityGetTopic(id)
      .then(setTopic)
      .catch((e) => setError(e instanceof Error ? e.message : "Ошибка загрузки"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadTopic();
  }, [loadTopic]);

  useEffect(() => {
    if (!topic || !topic.categoryId) {
      setSimilar([]);
      return;
    }
    communityTopics({
      category: topic.categoryId,
      page: 1,
      sort: "popular",
    })
      .then((res) => {
        setSimilar(
          res.items
            .filter((t) => t.id !== topic.id)
            .slice(0, 3)
            .map((t) => ({ id: t.id, title: t.title })),
        );
      })
      .catch(() => setSimilar([]));
  }, [topic?.id, topic?.categoryId]);

  useEffect(() => {
    if (!topic || isMaskedCommunityAuthor(topic.author)) {
      setAuthorProfile(null);
      return;
    }
    let cancelled = false;
    communityGetProfile(topic.author.id)
      .then((p) => {
        if (!cancelled) setAuthorProfile(p);
      })
      .catch(() => {
        if (!cancelled) setAuthorProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [topic?.author.id]);

  const replyRoots = useMemo(() => {
    if (!topic) return [];
    const tree = buildReplyTree(topic.replies);
    return sortReplyTree(tree, replySort);
  }, [topic, replySort]);

  const replyParent =
    topic && replyParentId ? topic.replies.find((r) => r.id === replyParentId) : undefined;

  const { text: countdownText, urgent: countdownUrgent } = useCountdownFull(topic?.closesAt ?? null);

  const startReplyTo = (r: CommunityReply) => {
    setReplyParentId(r.id);
    setComposerExpanded(true);
    queueMicrotask(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const expandComposer = () => {
    setComposerExpanded(true);
    queueMicrotask(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleDelete = async () => {
    if (actionInFlightRef.current) return;
    if (!confirm("Удалить тему? Это действие нельзя отменить.")) return;
    actionInFlightRef.current = true;
    try {
      await communityDeleteTopic(id);
      router.push(listHref);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleApprove = async () => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const updated = await communityApproveTopic(id);
      setTopic((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleReject = async () => {
    if (actionInFlightRef.current) return;
    if (!confirm("Отклонить и удалить эту тему?")) return;
    actionInFlightRef.current = true;
    try {
      await communityRejectTopic(id);
      router.push(listHref);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handlePin = async () => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const res = await communityPinTopic(id);
      setTopic((prev) => (prev ? { ...prev, isPinned: res.isPinned } : prev));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleDM = async (targetId: string) => {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    try {
      const chat = await communityStartDM(targetId);
      router.push(`/community/messages?chat=${chat.id}`);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleSubmitReply = async () => {
    if (!replyBody.trim() || submitting || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setSubmitting(true);
    setReplyError(null);
    try {
      const newReply = await communityCreateReply(id, {
        body: replyBody.trim(),
        parentId: replyParentId,
        isAnonymous: replyAnon,
      });
      setTopic((prev) =>
        prev ? { ...prev, replies: [...prev.replies, newReply] } : prev
      );
      setReplyBody("");
      setReplyParentId(null);
    } catch (e: unknown) {
      setReplyError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDeleteReply = async (replyId: string) => {
    if (actionInFlightRef.current) return;
    if (!confirm("Удалить ответ?")) return;
    actionInFlightRef.current = true;
    try {
      await communityDeleteReply(replyId);
      const fresh = await communityGetTopic(id);
      setTopic(fresh);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
    }
  };

  const handleEditReply = (reply: CommunityReply) => {
    setEditingReply(reply);
    setEditBody(reply.body);
  };

  const handleSaveEdit = async () => {
    if (!editingReply || !editBody.trim() || submitting || actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setSubmitting(true);
    try {
      await communityUpdateReply(editingReply.id, { body: editBody.trim() });
      setTopic((prev) =>
        prev
          ? {
              ...prev,
              replies: prev.replies.map((r) =>
                r.id === editingReply.id ? { ...r, body: editBody.trim() } : r
              ),
            }
          : prev
      );
      setEditingReply(null);
      setEditBody("");
    } catch (e: unknown) {
      setReplyError((e as Error).message);
    } finally {
      actionInFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const reportFeedback = useCallback(() => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    void navigator.clipboard.writeText(url).catch(() => {});
    window.alert("Ссылка на страницу скопирована. Отправьте её в поддержку с описанием проблемы.");
  }, []);

  const reportReply = useCallback((_r: CommunityReply) => {
    reportFeedback();
  }, [reportFeedback]);

  const sharePublicUrl =
    typeof window !== "undefined" ? `${window.location.origin}${communityFeedTopicPath(id)}` : "";

  if (loading) {
    return <DiscussionDetailSkeleton />;
  }

  if (error && !topic) {
    return (
        <div className="hub-discussion-page">
          <div className="hub-d-error-wrap">
            <InlineAlert tone="error">{error}</InlineAlert>
            <div className="hub-d-error-actions">
              <button type="button" className="hub-btn-primary" onClick={loadTopic}>
                Повторить
              </button>
              <Link href={listHref} className="hub-btn-ghost" style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                {openedFromFeed ? "В ленту" : "К вопросам"}
              </Link>
            </div>
          </div>
        </div>
    );
  }

  if (!topic) {
    return null;
  }

  const isOwn = currentUserId === topic.author.id;
  const topicStatus: string = topic.status ?? (topic.isClosed ? "closed" : "active");
  const closesAt: string | null = topic.closesAt ?? null;
  const canReply = !!currentUserId && topicStatus === "active";

  const category = categories.find((c) => c.id === topic.categoryId);
  const tintCss = category?.color ?? "var(--hub-accent)";
  const coverUrl = extractTopicCoverUrl(topic.body);
  const captionMd = bodyWithoutCoverMarkdown(topic.body, coverUrl);
  const votesNet = topic.votes.likes - topic.votes.dislikes;

  const replyParentSummary =
    replyParentId && replyParent ? (
      <div className="hub-d-reply-context">
        <span>
          Ответ для{" "}
          <strong>
            {replyParent.author.firstName} {replyParent.author.lastName}
          </strong>
          :{" "}
          <span className="hub-d-reply-context-snippet">
            {(() => {
              const t = replyParent.body.replace(/\s+/g, " ").trim();
              const short = t.slice(0, 100);
              return short + (t.length > short.length ? "…" : "");
            })()}
          </span>
        </span>
        <button type="button" className="hub-d-reply-context-clear" onClick={() => setReplyParentId(null)}>
          Сбросить
        </button>
      </div>
    ) : null;

  const resolvedImg =
    coverUrl && typeof window !== "undefined"
      ? /^https?:\/\//i.test(coverUrl)
        ? coverUrl
        : `${(process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/$/, "")}${coverUrl.startsWith("/") ? "" : "/"}${coverUrl.replace(/^\//, "")}`
      : coverUrl;

  return (
      <div className="hub-discussion-page">
        <ContentLayout
          main={
            <div className="hub-d-main">
              {error && topic ? (
                <div style={{ marginBottom: 16 }}>
                  <InlineAlert tone="error">{error}</InlineAlert>
                </div>
              ) : null}
              <header className={`hub-d-header${openedFromFeed ? " hub-d-header--feed" : ""}`}>
                <Link href={listHref} className="hub-d-back">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  {listBackLabel}
                </Link>
                {openedFromFeed ? (
                  <div className="hub-d-context-line" role="navigation" aria-label="Навигация">
                    <Link href="/community/topics">Архив вопросов</Link>
                    <span className="hub-d-breadcrumb-sep" aria-hidden>
                      ·
                    </span>
                    <span className="hub-d-context-muted">Обсуждение</span>
                  </div>
                ) : (
                  <nav className="hub-d-breadcrumb" aria-label="Навигация">
                    <Link href="/community/dashboard">Лента</Link>
                    <span className="hub-d-breadcrumb-sep">/</span>
                    <Link href="/community/topics">Архив вопросов</Link>
                    <span className="hub-d-breadcrumb-sep">/</span>
                    <span className="hub-d-breadcrumb-current">{topic.title}</span>
                  </nav>
                )}
              </header>

              {topicStatus === "pending" ? (
                <PendingTopicBanner isAdmin={isAdmin} onApprove={handleApprove} onReject={handleReject} />
              ) : null}

              <article className="hub-q-card">
                <div className="hub-q-card__meta-row">
                  {category ? (
                    <span className="hub-q-badge hub-q-badge--cat" style={{ color: category.color, background: `${category.color}14` }}>
                      {category.nameRu}
                    </span>
                  ) : null}
                  {topicStatus === "active" ? <span className="hub-q-badge hub-q-badge--live">Открыт</span> : null}
                  {topicStatus === "closed" ? <span className="hub-q-badge hub-q-badge--done">Закрыт</span> : null}
                  {topicStatus === "pending" ? <span className="hub-q-badge hub-q-badge--wait">Модерация</span> : null}
                  {topic.isPinned ? <span className="hub-q-badge hub-q-badge--pin">Закреплено</span> : null}
                </div>

                <h1 className="hub-q-card__title">{topic.title}</h1>

                <div className="hub-q-card__author">
                  {!isMaskedCommunityAuthor(topic.author) ? (
                    <Link href={`/community/profile/${topic.author.id}`} className="hub-q-card__avatar-link">
                      <AuthorAvatar author={topic.author} size={48} />
                    </Link>
                  ) : (
                    <AuthorAvatar author={topic.author} size={48} />
                  )}
                  <div className="hub-q-card__author-info">
                    <div className="hub-q-card__author-line">
                      {!isMaskedCommunityAuthor(topic.author) ? (
                        <Link href={`/community/profile/${topic.author.id}`} className="hub-q-card__author-name">
                          {topic.author.firstName} {topic.author.lastName}
                        </Link>
                      ) : (
                        <span className="hub-q-card__author-name">
                          {topic.author.firstName} {topic.author.lastName}
                        </span>
                      )}
                      <XpBadge xp={topic.author.communityXp} />
                    </div>
                    <div className="hub-q-card__author-meta">
                      <span>{formatRelative(topicPublicSince(topic))}</span>
                      <span className="hub-q-card__dot" aria-hidden />
                      <span>{topic.viewCount} просмотров</span>
                      <span className="hub-q-card__dot" aria-hidden />
                      <span>{topic.replies.length} ответов</span>
                      {closesAt && topicStatus === "active" ? (
                        <>
                          <span className="hub-q-card__dot" aria-hidden />
                          <span>до {formatDateTimeShort(closesAt)}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="hub-q-card__author-actions">
                    {currentUserId && !isOwn && !isMaskedCommunityAuthor(topic.author) ? (
                      <button type="button" onClick={() => handleDM(topic.author.id)} className="hub-btn-ghost hub-q-card__dm-btn">
                        Написать автору
                      </button>
                    ) : null}
                    {(isOwn || isAdmin) && (
                      <>
                        {isAdmin && (
                          <button type="button" onClick={handlePin} className="hub-btn-ghost">
                            {topic.isPinned ? "Открепить" : "Закрепить"}
                          </button>
                        )}
                        <button type="button" onClick={handleDelete} className="hub-btn-ghost hub-q-card__delete">
                          Удалить тему
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {captionMd.trim() ? (
                  <div className="hub-q-card__body hub-topic-prose">
                    <CommunityMarkdown body={captionMd} />
                  </div>
                ) : null}

                {coverUrl ? (
                  <QuestionMedia coverUrl={coverUrl} accentColor={tintCss} onOpenLightbox={() => setImgLightbox(true)} />
                ) : null}

                <QuestionActionBar
                  topicId={topic.id}
                  topicTitle={topic.title}
                  publicUrl={sharePublicUrl}
                  votes={topic.votes}
                  myVote={topic.myVote}
                  voteDisabled={!currentUserId || isOwn || topicStatus !== "active"}
                  canAnswer={canReply}
                  onAnswerClick={expandComposer}
                  onReportTopic={reportFeedback}
                />
              </article>

              {topicStatus === "closed" && topic.aiSummary ? (
                <section className="hub-d-ai-summary">
                  <div className="hub-d-ai-summary__label">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Резюме обсуждения (ИИ)
                  </div>
                  <div className="hub-d-ai-summary__body hub-topic-prose">
                    <CommunityMarkdown body={topic.aiSummary} />
                  </div>
                </section>
              ) : null}

              <section
                id="discussion-composer"
                ref={composerRef}
                className="hub-d-composer-section"
                aria-labelledby="composer-heading"
              >
                <h2 id="composer-heading" className="sr-only">
                  Ваш ответ
                </h2>
                <div className="hub-d-composer-wrap">
                  {currentUserId && topicStatus === "active" ? (
                    <ReplyComposer
                      expanded={composerExpanded}
                      onExpand={() => setComposerExpanded(true)}
                      body={replyBody}
                      onBodyChange={setReplyBody}
                      replyParentSummary={replyParentSummary}
                      isAnonymous={replyAnon}
                      onAnonymousChange={setReplyAnon}
                      onSubmit={() => void handleSubmitReply()}
                      submitting={submitting}
                      error={replyError}
                      disabled={false}
                    />
                  ) : null}

                  {topicStatus === "closed" ? (
                    <p className="hub-d-closed-hint">Обсуждение завершено.</p>
                  ) : null}

                  {!currentUserId && topicStatus === "active" ? (
                    <div className="hub-d-login-cta">
                      <p className="hub-d-login-cta-title">Войдите, чтобы ответить</p>
                      <Link href="/community" className="hub-btn-primary">
                        Войти
                      </Link>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="hub-d-replies" aria-labelledby="replies-heading">
                <div className="hub-d-replies-head">
                  <h2 id="replies-heading" className="hub-d-replies-title">
                    Ответы
                    <span className="hub-d-replies-count">{topic.replies.length}</span>
                  </h2>
                  <div className="hub-d-replies-tools">
                    <div className="hub-d-sort" role="group" aria-label="Сортировка ответов">
                      {(["best", "new", "old"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`hub-d-sort-btn${replySort === key ? " hub-d-sort-btn--active" : ""}`}
                          onClick={() => setReplySort(key)}
                        >
                          {key === "best" ? "Лучшие" : key === "new" ? "Новые" : "Старые"}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {topic.replies.length === 0 ? (
                  <div className="hub-d-empty-replies">
                    <p className="hub-d-empty-replies-title">Пока нет ответов</p>
                    <p className="hub-d-empty-replies-text hub-d-empty-replies-text--solo">
                      {canReply ? "Напишите первый ответ." : "Ответов пока нет."}
                    </p>
                  </div>
                ) : (
                  <div className="hub-d-reply-tree">
                    <ReplyThread
                      nodes={replyRoots}
                      depth={0}
                      variant="discussion"
                      topicAuthorId={topic.author.id}
                      {...(currentUserId ? { currentUserId } : {})}
                      onDelete={handleDeleteReply}
                      onEdit={handleEditReply}
                      {...(canReply ? { onReply: startReplyTo } : {})}
                      onReportReply={reportReply}
                    />
                  </div>
                )}
              </section>
            </div>
          }
          right={
            <DiscussionRightPanel
              topicStatus={topicStatus}
              closesAt={closesAt}
              acceptsNewReplies={topicStatus === "active"}
              countdownText={
                topicStatus === "active" && closesAt
                  ? countdownText
                    ? `осталось ${countdownText}`
                    : null
                  : null
              }
              countdownUrgent={countdownUrgent}
              category={category}
              viewCount={topic.viewCount}
              replyCount={topic.replies.length}
              topicVotesNet={votesNet}
              author={topic.author}
              authorStatsLoading={!isMaskedCommunityAuthor(topic.author) && authorProfile === undefined}
              authorTopicsCount={authorProfile?.stats.topicsCount ?? null}
              authorRepliesCount={authorProfile?.stats.repliesCount ?? null}
              similar={similar}
            />
          }
        />

        {imgLightbox && resolvedImg ? (
          <button
            type="button"
            className="hub-d-lightbox"
            aria-label="Закрыть"
            onClick={() => setImgLightbox(false)}
          >
            <img src={resolvedImg} alt="" className="hub-d-lightbox-img" />
          </button>
        ) : null}

        {editingReply ? (
          <div className="hub-modal-overlay" onClick={() => setEditingReply(null)}>
            <div className="hub-modal" onClick={(e) => e.stopPropagation()}>
              <div className="hub-modal-header">
                <span className="hub-modal-title">Редактировать ответ</span>
                <button type="button" className="hub-modal-close" onClick={() => setEditingReply(null)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="hub-modal-body">
                <MarkdownComposer
                  className="hub-field-input"
                  value={editBody}
                  onChange={(v) => setEditBody(v)}
                  rows={6}
                  placeholder="Текст ответа…"
                  textareaStyle={{ resize: "vertical", width: "100%", fontFamily: "inherit", fontSize: "var(--text-sm)" }}
                  plainText
                />
                {replyError ? <InlineAlert tone="error">{replyError}</InlineAlert> : null}
                <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                  <button type="button" className="hub-btn-primary" onClick={() => void handleSaveEdit()} disabled={submitting}>
                    {submitting ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button type="button" className="hub-btn-ghost" onClick={() => setEditingReply(null)}>
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
  );
}
