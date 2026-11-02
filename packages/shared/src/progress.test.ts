import { describe, expect, it } from 'vitest';
import { computeProgress } from './progress.js';
import { missionPlanSchema } from './schemas.js';

describe('computeProgress', () => {
  it('returns 0 for no tasks', () => {
    expect(computeProgress([]).percent).toBe(0);
  });
  it('ignores cancelled tasks and counts only completed ones', () => {
    const p = computeProgress(['completed', 'running', 'cancelled', 'completed', 'failed']);
    expect(p).toEqual({ total: 4, completed: 2, failed: 1, percent: 50 });
  });
});

describe('missionPlanSchema', () => {
  it('rejects plans with too many tasks', () => {
    const tasks = Array.from({ length: 13 }, (_, i) => ({
      key: `t${i}`,
      title: 't',
      instruction: 'i',
      role: 'researcher',
    }));
    expect(missionPlanSchema.safeParse({ summary: 's', tasks }).success).toBe(false);
  });
});
