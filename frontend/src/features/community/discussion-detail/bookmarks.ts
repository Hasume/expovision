export const COMMUNITY_TOPIC_BOOKMARKS_STORAGE_KEY = "expovision_community_topic_bookmarks";

const STORAGE_KEY = COMMUNITY_TOPIC_BOOKMARKS_STORAGE_KEY;

function readIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]));
  } catch {
    /* ignore quota */
  }
}

export function getBookmarkedTopicIds(): string[] {
  return readIds();
}

export function isTopicBookmarked(topicId: string): boolean {
  return readIds().includes(topicId);
}

/** @returns new bookmarked state */
export function toggleTopicBookmark(topicId: string): boolean {
  const cur = readIds();
  const has = cur.includes(topicId);
  const next = has ? cur.filter((id) => id !== topicId) : [...cur, topicId];
  writeIds(next);
  return !has;
}
