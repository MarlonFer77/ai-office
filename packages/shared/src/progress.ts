import type { TaskStatus } from './domain.js';

/**
 * Project/mission progress is derived only from verifiable task completion.
 * Cancelled tasks are excluded from the denominator.
 */
export function computeProgress(statuses: TaskStatus[]): {
  total: number;
  completed: number;
  failed: number;
  percent: number;
} {
  const considered = statuses.filter((s) => s !== 'cancelled');
  const completed = considered.filter((s) => s === 'completed').length;
  const failed = considered.filter((s) => s === 'failed').length;
  const total = considered.length;
  return {
    total,
    completed,
    failed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
