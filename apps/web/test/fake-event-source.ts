import { vi } from 'vitest';

/**
 * A scriptable stand-in for the browser's EventSource (happy-dom has none). Tests drive it with
 * `open()`, `emit()` and `fail()`; every instance is kept in `FakeEventSource.instances`.
 */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.CONNECTING;
  onopen: ((e: Event) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  private listeners = new Map<string, Set<(e: MessageEvent<string>) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    FakeEventSource.instances.push(this);
  }

  static latest(): FakeEventSource {
    const last = FakeEventSource.instances.at(-1);
    if (!last) throw new Error('no EventSource was opened');
    return last;
  }

  addEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: (e: MessageEvent<string>) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  close() {
    this.readyState = FakeEventSource.CLOSED;
  }

  open() {
    this.readyState = FakeEventSource.OPEN;
    this.onopen?.(new Event('open'));
  }

  /** A server frame `event: <msg.type>` carrying `msg` as JSON. */
  emit(msg: { type: string } & Record<string, unknown>) {
    const e = new MessageEvent('message', { data: JSON.stringify(msg) });
    for (const fn of this.listeners.get(msg.type) ?? []) fn(e as MessageEvent<string>);
  }

  /** A dropped connection: the browser is retrying (CONNECTING) unless `closed`. */
  fail({ closed = false } = {}) {
    this.readyState = closed ? FakeEventSource.CLOSED : FakeEventSource.CONNECTING;
    this.onerror?.(new Event('error'));
  }
}

export function installFakeEventSource() {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
}
