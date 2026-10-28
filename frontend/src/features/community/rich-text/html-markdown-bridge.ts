import DOMPurify from "dompurify";
import TurndownService from "turndown";
import { marked } from "marked";

/** Tags TipTap may emit or Word/Docs paste may bring; stripped down for community bodies. */
const RICH_ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "b",
  "em",
  "i",
  "s",
  "del",
  "strike",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "h2",
  "h3",
  "blockquote",
  "pre",
  "code",
  "hr",
];

const RICH_ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "class"];

function configureMarked(): void {
  marked.setOptions({
    gfm: true,
    breaks: false,
  });
}

export function sanitizeCommunityRichHtml(html: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: RICH_ALLOWED_TAGS,
    ALLOWED_ATTR: RICH_ALLOWED_ATTR,
    ADD_ATTR: ["target", "rel"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "style"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
  if (typeof document === "undefined") return clean;
  const tpl = document.createElement("template");
  tpl.innerHTML = clean;
  tpl.content.querySelectorAll("a[href]").forEach((a) => {
    const el = a as HTMLAnchorElement;
    const href = el.getAttribute("href") ?? "";
    if (/^javascript:/i.test(href) || /^data:/i.test(href)) {
      el.removeAttribute("href");
      return;
    }
    if (/^https?:\/\//i.test(href)) {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  });
  return tpl.innerHTML;
}

let turndown: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndown) {
    const td = new TurndownService({
      headingStyle: "atx",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      emDelimiter: "*",
    });
    td.addRule("strikethrough", {
      filter(node) {
        const n = node.nodeName;
        return n === "DEL" || n === "S" || n === "STRIKE";
      },
      replacement(content) {
        return `~~${content}~~`;
      },
    });
    turndown = td;
  }
  return turndown;
}

/** Editor HTML → markdown for API + existing CommunityMarkdown pipeline. */
export function richHtmlToCommunityMarkdown(html: string): string {
  const clean = sanitizeCommunityRichHtml(html);
  const md = getTurndown().turndown(clean).trim();
  return md.replace(/\n{3,}/g, "\n\n");
}

/** Markdown (saved topics) → safe HTML for TipTap `setContent`. */
export function communityMarkdownToRichHtml(md: string): string {
  const t = md.trim();
  if (!t) return "";
  configureMarked();
  const raw = marked.parse(t, { async: false }) as string;
  return sanitizeCommunityRichHtml(raw);
}
