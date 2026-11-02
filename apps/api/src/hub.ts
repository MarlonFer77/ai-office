import type { Redis } from 'ioredis';
import type { OfficeEvent } from '@ai-office/shared';

type Listener = (event: OfficeEvent) => void;

/**
 * Single Redis pattern subscription fanned out to SSE connections by project.
 * Workers publish; any API replica can serve any client.
 */
export class EventHub {
  private readonly listeners = new Map<string, Set<Listener>>();
  constructor(private readonly subscriber: Redis) {}

  async start() {
    await this.subscriber.psubscribe('ai-office:events:*');
    this.subscriber.on('pmessage', (_pattern, channel, message) => {
      const projectId = channel.slice('ai-office:events:'.length);
      const set = this.listeners.get(projectId);
      if (!set?.size) return;
      let event: OfficeEvent;
      try {
        event = JSON.parse(message) as OfficeEvent;
      } catch {
        return;
      }
      for (const l of set) l(event);
    });
  }

  subscribe(projectId: string, listener: Listener): () => void {
    let set = this.listeners.get(projectId);
    if (!set) this.listeners.set(projectId, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(projectId);
    };
  }

  connectionCount() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}
