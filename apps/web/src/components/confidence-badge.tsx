import type { ConfidenceLevel } from '@phoenix-ai/shared';
import { Badge } from './ui/badge.js';

import type { JSX } from 'react';

const VARIANT_BY_LEVEL: Record<ConfidenceLevel, 'success' | 'warning' | 'danger' | 'info'> = {
  high: 'success',
  medium: 'warning',
  low: 'danger',
  inferred: 'info',
};

const LABEL_BY_LEVEL: Record<ConfidenceLevel, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
  inferred: 'Inferred',
};

export const CONFIDENCE_COLORS: Record<ConfidenceLevel, string> = {
  high: '#10b981',
  medium: '#f59e0b',
  low: '#f43f5e',
  inferred: '#8b5cf6',
};

export function ConfidenceBadge({
  level,
  score,
}: {
  level: ConfidenceLevel;
  score?: number | undefined;
}): JSX.Element {
  return (
    <Badge
      variant={VARIANT_BY_LEVEL[level]}
      title={score ? `Score: ${Math.round(score * 100)}%` : undefined}
    >
      {LABEL_BY_LEVEL[level]}
      {typeof score === 'number' ? ` · ${Math.round(score * 100)}%` : ''}
    </Badge>
  );
}
