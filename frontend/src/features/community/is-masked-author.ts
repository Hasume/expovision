import type { AuthorPreview } from "@/features/api";

/**
 * The viewer sees a hidden identity (someone else's post): shared id "anon" or the a- prefix from the API.
 * Not the same as author.isAnonymous for the author: on their own post the real id is kept.
 */
export function isMaskedCommunityAuthor(author: Pick<AuthorPreview, "id">): boolean {
  return author.id === "anon" || author.id.startsWith("a-");
}
