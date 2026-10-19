/**
 * Reads one line from stdin, or `null` when stdin closes first.
 *
 * `rl.question` alone never settles on a closed or empty stdin, so Node exits 13
 * ("unsettled top-level await") with no envelope. It also resolves only on a
 * newline, while a piped value often has none (`printf 'key' |`, `echo -n`,
 * secret managers). At end of input readline emits that last partial line as a
 * `line` event before `close`, so the race listens for `line` first, then
 * `close`.
 */

import * as readline from 'node:readline/promises';
import { once } from 'node:events';
import { stdin } from 'node:process';

export async function promptLine(question: string, output: NodeJS.WritableStream): Promise<string | null> {
  const rl = readline.createInterface({ input: stdin, output });
  const line = once(rl, 'line').then(([text]) => String(text));
  const closed = once(rl, 'close').then(() => null);
  try {
    return await Promise.race([rl.question(question), line, closed]);
  } finally {
    rl.close();
  }
}
