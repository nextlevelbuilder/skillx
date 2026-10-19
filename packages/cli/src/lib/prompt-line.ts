/**
 * Reads one line from stdin, or `null` when stdin closes first.
 *
 * `rl.question` alone never settles on a closed or empty stdin, so Node exits 13
 * ("unsettled top-level await") with no envelope. Racing it against `close`
 * lets the command report the missing input itself.
 */

import * as readline from 'node:readline/promises';
import { once } from 'node:events';
import { stdin } from 'node:process';

export async function promptLine(question: string, output: NodeJS.WritableStream): Promise<string | null> {
  const rl = readline.createInterface({ input: stdin, output });
  const closed = once(rl, 'close').then(() => null);
  try {
    return await Promise.race([rl.question(question), closed]);
  } finally {
    rl.close();
  }
}
