import type { ReviewItem } from '@phoenix-ai/shared';
import { reviewItems } from '../data/seed.js';

export function getReviewItems(): ReviewItem[] {
  return reviewItems;
}
