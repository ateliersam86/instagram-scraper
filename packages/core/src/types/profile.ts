/**
 * Public Instagram profile model.
 * Filled progressively as Phase 2 lands. Everything is optional except `username`.
 */
export type InstagramProfile = {
  username: string;
  /** Numeric Instagram user id. */
  id?: string;
  fullName?: string;
  bio?: string;
  /** External URL on profile (often a Linktree). */
  externalUrl?: string;
  avatarUrl?: string;
  isVerified?: boolean;
  isPrivate?: boolean;
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
  /** Recent post shortcodes (for follow-up scraping). */
  recentPostShortcodes?: string[];
};
