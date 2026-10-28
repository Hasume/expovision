/** Public path to a discussion card from the feed (without the `/topics/` segment). */
export function communityFeedTopicPath(topicId: string): string {
  return `/community/post/${topicId}`;
}
