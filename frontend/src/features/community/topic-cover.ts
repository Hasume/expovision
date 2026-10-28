/** First image URL from topic body (markdown, raw URL, or <img>). */

const MD_IMG = /!\[[^\]]*\]\(([^)\s]+)\)/;
const HTML_IMG = /<img[^>]+src=["']([^"']+)["']/i;
const BARE_IMG = /(https?:\/\/[^\s)\]"']+\.(?:webp|jpg|jpeg|png|gif|avif))(?:\?[^\s)\]"']*)?/i;
const BARE_IMG_LINE =
  /^\s*(https?:\/\/[^\s]+\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?[^\s]*)?)\s*$/i;

/** Path + query for deduplicating API vs absolute URLs. */
export function normalizeAssetUrl(u: string): string {
  const t = u.trim();
  if (!t) return "";
  try {
    if (/^https?:\/\//i.test(t)) {
      const url = new URL(t);
      return url.pathname + (url.search || "");
    }
  } catch {
    /* ignore */
  }
  const noHash = t.split("#")[0] ?? t;
  return noHash.startsWith("/") ? noHash : `/${noHash}`;
}

function markdownImageUrlPaths(body: string): Set<string> {
  const set = new Set<string>();
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = m[1]?.trim();
    if (raw) set.add(normalizeAssetUrl(raw));
  }
  return set;
}

/** Drops a line that is only a bare image URL when it duplicates some ![](...) in the same body. */
function stripBareUrlsDuplicatingMarkdownImages(body: string): string {
  const mdPaths = markdownImageUrlPaths(body);
  if (mdPaths.size === 0) return body;
  const lines = body.split("\n");
  const out = lines.filter((line) => {
    const bm = BARE_IMG_LINE.exec(line);
    if (!bm?.[1]) return true;
    return !mdPaths.has(normalizeAssetUrl(bm[1]));
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Drops a standalone bare image URL line matching the cover (shown separately). */
function stripBareCoverLine(body: string, coverUrl: string | null): string {
  if (!coverUrl?.trim()) return body;
  const cov = normalizeAssetUrl(coverUrl);
  const lines = body.split("\n");
  const out = lines.filter((line) => {
    const bm = BARE_IMG_LINE.exec(line);
    if (!bm?.[1]) return true;
    return normalizeAssetUrl(bm[1]) !== cov;
  });
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function extractTopicCoverUrl(body: string | null | undefined): string | null {
  if (!body?.trim()) return null;
  const md = body.match(MD_IMG);
  if (md?.[1]) return md[1].trim();
  const html = body.match(HTML_IMG);
  if (html?.[1]) return html[1].trim();
  const bare = body.match(BARE_IMG);
  if (bare?.[1]) return bare[1].trim();
  return null;
}

export function stripTopicBodyPreview(body: string | null | undefined, maxLen: number): string {
  if (!body?.trim()) return "";
  let s = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/https?:\/\/[^\s]+\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?[^\s]*)?/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/[#*_>~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

/** Preview text for the summary (strip **bold** first so words are not broken). */
export function stripMarkdownSummaryPreview(raw: string | null | undefined, maxLen: number): string {
  if (!raw?.trim()) return "";
  let s = raw
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/https?:\/\/[^\s]+\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?[^\s]*)?/gi, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

/** Removes the image with the same URL as the post header cover from the markdown (no duplicate). */
export function bodyWithoutCoverMarkdown(body: string, coverUrl: string | null): string {
  if (!body?.trim()) return body;
  let next = body;
  if (coverUrl?.trim()) {
    const escaped = coverUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    next = next.replace(new RegExp(`!\\[[^\\]]*\\]\\(${escaped}\\)`, "gi"), "");
    next = next.replace(/\n{3,}/g, "\n\n").trim();
    next = stripBareCoverLine(next, coverUrl);
  }
  next = stripBareUrlsDuplicatingMarkdownImages(next);
  return next;
}
