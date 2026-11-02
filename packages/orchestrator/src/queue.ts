import { Queue } from 'bullmq';

export const QUEUE_NAME = 'ai-office-runs';

export type JobData =
  | { kind: 'plan'; missionId: string }
  | { kind: 'task'; taskId: string }
  | { kind: 'chat'; runId: string };

export interface JobQueue {
  enqueue(job: JobData, opts?: { delayMs?: number }): Promise<void>;
  close(): Promise<void>;
}

/** Jobs are idempotent: handlers verify state transitions atomically before acting. */
export class BullJobQueue implements JobQueue {
  private readonly queue: Queue<JobData>;
  constructor(redisUrl: string) {
    this.queue = new Queue<JobData>(QUEUE_NAME, {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  async enqueue(job: JobData, opts: { delayMs?: number } = {}) {
    await this.queue.add(job.kind, job, opts.delayMs ? { delay: opts.delayMs } : {});
  }
  async close() {
    await this.queue.close();
  }
}

/** In-memory queue used by tests: records jobs; the test drives execution. */
export class MemoryJobQueue implements JobQueue {
  jobs: { job: JobData; delayMs?: number }[] = [];
  async enqueue(job: JobData, opts: { delayMs?: number } = {}) {
    this.jobs.push({ job, ...(opts.delayMs !== undefined ? { delayMs: opts.delayMs } : {}) });
  }
  take(): JobData | undefined {
    return this.jobs.shift()?.job;
  }
  async close() {}
}
