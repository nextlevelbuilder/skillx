/**
 * Minimal forward-only byte reader over a stream, used by the archive
 * readers so content is hashed as it streams and never buffered whole.
 */
import { ERROR_CODES, SkillTreeError } from "./errors";

/** Archive bytes: a whole buffer, a web stream, or any async iterable of chunks. */
export type ByteSource = Uint8Array | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

export function readFailed(detail: string, cause?: unknown): SkillTreeError {
  return new SkillTreeError(ERROR_CODES.readFailed, "", detail, cause === undefined ? undefined : { cause });
}

async function* iterateStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    // Stops an upstream producer (or a decompressor) when reading ends early.
    await reader.cancel().catch(() => undefined);
  }
}

export function toAsyncIterable(source: ByteSource): AsyncIterable<Uint8Array> {
  if (source instanceof Uint8Array) {
    return (async function* () {
      yield source;
    })();
  }
  if (typeof ReadableStream !== "undefined" && source instanceof ReadableStream) return iterateStream(source);
  return source as AsyncIterable<Uint8Array>;
}

/** Compressed bytes fed per step. */
const INFLATE_SLICE = 16 * 1024;
const noop = () => undefined;
const EMPTY = Symbol("empty");

/**
 * Inflates `source` through a web `DecompressionStream` (gzip or raw deflate),
 * pull-driven so a decompression bomb stops near the consumer's limit. A new
 * slice is written only when no inflated output is waiting and the previous
 * write has been taken by the decompressor; otherwise the writable's queue
 * (high-water mark counted in chunks) would accept the whole source. The same
 * holds for `pipeThrough`, which pumps input regardless of the consumer.
 */
export async function* decompress(source: AsyncIterable<Uint8Array>, format: "gzip" | "deflate-raw"): AsyncGenerator<Uint8Array> {
  const stream = new DecompressionStream(format);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const input = source[Symbol.asyncIterator]();
  let pending: Uint8Array = new Uint8Array(0);
  let inputDone = false;
  // Settles (to EMPTY) once the decompressor has taken the last written slice.
  let taken: Promise<typeof EMPTY> = Promise.resolve(EMPTY);
  let read = reader.read();
  read.catch(noop);
  try {
    for (;;) {
      // Output wins when queued (a read of a queued chunk is already settled);
      // otherwise wait until the decompressor took the last slice, then feed.
      const ready = inputDone ? await read : await Promise.race([read, taken]);
      if (ready !== EMPTY) {
        if (ready.done) return;
        yield ready.value;
        read = reader.read();
        read.catch(noop);
        continue;
      }
      if (pending.length === 0) {
        const next = await input.next();
        if (next.done) {
          inputDone = true;
          writer.close().catch(noop); // a failure surfaces through `read`
          continue;
        }
        pending = next.value;
        continue;
      }
      const slice = pending.subarray(0, INFLATE_SLICE);
      pending = pending.subarray(slice.length);
      // The DOM typings take only ArrayBuffer-backed views; any Uint8Array works at runtime.
      taken = writer.write(slice as Uint8Array<ArrayBuffer>).then(() => EMPTY);
      taken.catch(noop); // a rejection is rethrown by the race above
    }
  } finally {
    await reader.cancel().catch(noop);
    await Promise.resolve(input.return?.()).catch(noop);
  }
}

export class StreamReader {
  private readonly it: AsyncIterator<Uint8Array>;
  private chunk: Uint8Array = new Uint8Array(0);
  private offset = 0;
  private ended = false;

  constructor(source: AsyncIterable<Uint8Array>) {
    this.it = source[Symbol.asyncIterator]();
  }

  private async nextChunk(): Promise<boolean> {
    while (!this.ended) {
      const next = await this.it.next();
      if (next.done) {
        this.ended = true;
        return false;
      }
      if (next.value.length > 0) {
        this.chunk = next.value;
        this.offset = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Reads exactly `n` bytes. Returns null when the stream ends before the
   * first byte; throws `tree.read_failed` when it ends part way.
   */
  async readExact(n: number): Promise<Uint8Array | null> {
    const out = new Uint8Array(n);
    let filled = 0;
    while (filled < n) {
      if (this.offset >= this.chunk.length && !(await this.nextChunk())) {
        if (filled === 0) return null;
        throw readFailed(`stream ends after ${filled} of ${n} bytes`);
      }
      const take = Math.min(n - filled, this.chunk.length - this.offset);
      out.set(this.chunk.subarray(this.offset, this.offset + take), filled);
      this.offset += take;
      filled += take;
    }
    return out;
  }

  /** Yields exactly `n` bytes in chunks; throws `tree.read_failed` if the stream ends first. */
  async *chunks(n: number): AsyncGenerator<Uint8Array> {
    let left = n;
    while (left > 0) {
      if (this.offset >= this.chunk.length && !(await this.nextChunk())) {
        throw readFailed(`stream ends ${left} bytes before the end of an entry`);
      }
      const take = Math.min(left, this.chunk.length - this.offset);
      const piece = this.chunk.subarray(this.offset, this.offset + take);
      this.offset += take;
      left -= take;
      yield piece;
    }
  }

  async skip(n: number): Promise<void> {
    for await (const piece of this.chunks(n)) void piece;
  }

  /** Releases the underlying stream after an early stop. */
  async close(): Promise<void> {
    if (!this.ended) await this.it.return?.();
  }
}

/** Wraps any non-contract failure of a reader as `tree.read_failed`. */
export function asTreeError(err: unknown): SkillTreeError {
  if (err instanceof SkillTreeError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return readFailed(`archive read failed: ${message}`, err);
}
