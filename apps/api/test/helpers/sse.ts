import type { AddressInfo } from 'node:net';
import type { Express } from 'express';
import { afterEach } from 'vitest';

export interface SseFrame {
  id?: string;
  event?: string;
  data?: string;
  retry?: string;
  comment?: string;
}

/** Splits raw SSE text into frames (blank-line separated); comment-only frames keep their text. */
export function parseFrames(text: string): SseFrame[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim() !== '')
    .map((block) => {
      const f: SseFrame = {};
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) f.comment = line.slice(1).trim();
        const m = /^(id|event|data|retry): ?(.*)$/.exec(line);
        if (m) f[m[1] as 'id' | 'event' | 'data' | 'retry'] = m[2];
      }
      return f;
    });
}

export interface OpenStream {
  status: number;
  headers: Headers;
  body: string;
  text: () => string;
  frames: () => SseFrame[];
  /** Resolves once the frames received so far satisfy `pred`. */
  until: (pred: (frames: SseFrame[]) => boolean, timeoutMs?: number) => Promise<SseFrame[]>;
  /** Resolves when the server ends the response. */
  ended: Promise<void>;
  close: () => void;
}

/**
 * Serves `app` on a random port for this test file and opens SSE streams against it with real
 * fetch, so the stream's chunks arrive as a browser would see them. Closed after each test.
 */
export function useSseServer(getApp: () => Express) {
  const open: { abort: AbortController; server: import('node:http').Server }[] = [];

  afterEach(async () => {
    for (const { abort, server } of open.splice(0)) {
      abort.abort();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  return async function connect(
    path: string,
    { cookie, headers = {} }: { cookie?: string; headers?: Record<string, string> } = {},
  ): Promise<OpenStream> {
    const server = getApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    const abort = new AbortController();
    open.push({ abort, server });

    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      headers: { ...(cookie ? { Cookie: `dp_sess=${cookie}` } : {}), ...headers },
      signal: abort.signal,
    });
    let text = '';
    const waiters = new Set<() => void>();
    let resolveEnded = () => {};
    const ended = new Promise<void>((resolve) => {
      resolveEnded = resolve;
    });

    if (res.headers.get('content-type')?.startsWith('text/event-stream') && res.body) {
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      void (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            text += value;
            for (const w of waiters) w();
          }
        } catch {
          // aborted by the test
        }
        resolveEnded();
      })();
    } else {
      text = await res.text();
      resolveEnded();
    }

    return {
      status: res.status,
      headers: res.headers,
      body: text,
      text: () => text,
      frames: () => parseFrames(text),
      ended,
      close: () => abort.abort(),
      until(pred, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
          const check = () => {
            const frames = parseFrames(text);
            if (pred(frames)) {
              waiters.delete(check);
              clearTimeout(timer);
              resolve(frames);
            }
          };
          const timer = setTimeout(() => {
            waiters.delete(check);
            reject(new Error(`timed out waiting for frames; got:\n${text}`));
          }, timeoutMs);
          waiters.add(check);
          check();
        });
      },
    };
  };
}
