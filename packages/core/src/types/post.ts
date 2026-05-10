/**
 * A single post / reel (carousels include multiple `media` entries).
 */
export type InstagramPostMedia = {
  /** Highest-resolution photo URL. */
  url: string;
  /** Pixel dimensions when available. */
  width?: number;
  height?: number;
  /** Whether this slot is a video (vs photo). */
  isVideo?: boolean;
  /** When `isVideo`, the playable URL (may differ from `url` which is the cover). */
  videoUrl?: string;
  durationSeconds?: number;
};

export type InstagramLocation = {
  /** Numeric Instagram location id. */
  id: string;
  name: string;
  slug?: string;
};

export type InstagramPost = {
  /** Shortcode visible in the URL: `/p/{shortcode}/`. */
  shortcode: string;
  /** Numeric Instagram post id (different from shortcode). */
  id?: string;
  /** Author username; full profile fetched separately. */
  authorUsername?: string;
  authorId?: string;
  authorFullName?: string;
  authorAvatarUrl?: string;
  caption?: string;
  /** ISO 8601 of the post timestamp. */
  takenAt?: string;
  likeCount?: number;
  commentsCount?: number;
  isVideo?: boolean;
  /** True if the post is a reel (`/reel/{shortcode}/`). */
  isReel?: boolean;
  /** Carousel slots (single-photo posts have one entry). */
  media: InstagramPostMedia[];
  hashtags?: string[];
  mentions?: string[];
  location?: InstagramLocation;
};

export type InstagramStoryItem = {
  id: string;
  /** ISO timestamp the story was posted. */
  takenAt: string;
  /** Expiry: takenAt + 24h, computed at parse time. */
  expiresAt: string;
  isVideo: boolean;
  /** Cover image URL. */
  imageUrl: string;
  /** Playable video URL when `isVideo`. */
  videoUrl?: string;
  durationSeconds?: number;
  /** Mentioned usernames in the story. */
  mentions?: string[];
  hashtags?: string[];
  /** Music sticker. */
  music?: { title: string; artist?: string };
};
