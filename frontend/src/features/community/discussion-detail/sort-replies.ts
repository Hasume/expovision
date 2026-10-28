import type { ReplyNode } from "@/features/community/components";

export type ReplySortMode = "best" | "new" | "old";

function score(n: ReplyNode): number {
  return n.votes.likes - n.votes.dislikes;
}

function sortSiblings(nodes: ReplyNode[], mode: ReplySortMode): ReplyNode[] {
  const sorted = [...nodes];
  if (mode === "best") {
    sorted.sort((a, b) => {
      const ds = score(b) - score(a);
      if (ds !== 0) return ds;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  } else if (mode === "new") {
    sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } else {
    sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return sorted.map((n) => ({
    ...n,
    children: sortSiblings(n.children, mode),
  }));
}

export function sortReplyTree(roots: ReplyNode[], mode: ReplySortMode): ReplyNode[] {
  return sortSiblings(roots, mode);
}
