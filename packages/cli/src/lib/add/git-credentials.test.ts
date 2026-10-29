import { execFileSync, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError } from '../output.js';
import { openGitSource } from './git-source.js';

/**
 * A URL credential travels as an `Authorization` header, and git would send
 * it to wherever a redirect leads. Two servers run in a child process (git
 * runs synchronously, so they cannot share this event loop): `origin` sends
 * every request on to `elsewhere`, a working smart-HTTP server on another
 * host, and both log the Authorization header they receive. Only the `http` transport, which tests alone may allow, can
 * reach them.
 */

const SERVERS = `
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const [log, projectRoot] = process.argv.slice(1);
const record = (name, req) => fs.appendFileSync(log, JSON.stringify({ name, method: req.method, auth: req.headers.authorization ?? null }) + '\\n');
// A real smart-HTTP server (git http-backend as CGI), so git goes on to POST after the redirect.
const elsewhere = http.createServer((req, res) => {
  record('elsewhere', req);
  const [path, query = ''] = req.url.split('?');
  const cgi = spawn('git', ['http-backend'], { env: { ...process.env, GIT_PROJECT_ROOT: projectRoot, GIT_HTTP_EXPORT_ALL: '1', PATH_INFO: path, QUERY_STRING: query, REQUEST_METHOD: req.method, CONTENT_TYPE: req.headers['content-type'] ?? '', GIT_PROTOCOL: req.headers['git-protocol'] ?? '' } });
  req.pipe(cgi.stdin);
  const chunks = [];
  cgi.stdout.on('data', (c) => chunks.push(c));
  cgi.on('close', () => {
    const out = Buffer.concat(chunks);
    const split = out.indexOf('\\r\\n\\r\\n');
    const headers = out.subarray(0, split).toString('latin1').split('\\r\\n');
    let status = 200;
    for (const h of headers) {
      const [k, ...v] = h.split(':');
      if (k.toLowerCase() === 'status') status = Number(v.join(':').trim().split(' ')[0]);
      else res.setHeader(k, v.join(':').trim());
    }
    res.statusCode = status;
    res.end(out.subarray(split + 4));
  });
});
elsewhere.listen(0, '127.0.0.2', () => {
  const to = elsewhere.address().port;
  const origin = http.createServer((req, res) => {
    record('origin', req);
    res.writeHead(302, { location: 'http://127.0.0.2:' + to + req.url });
    res.end();
  });
  origin.listen(0, '127.0.0.1', () => console.log(String(origin.address().port)));
});
`;

let dir: string;
let log: string;
let servers: ChildProcess;
let originPort: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'skillx-add-cred-'));
  log = join(dir, 'requests.jsonl');
  const work = join(dir, 'work');
  mkdirSync(work);
  const run = (cwd: string, args: string[]) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'ignore' });
  run(work, ['init', '-q', '-b', 'main']);
  writeFileSync(join(work, 'SKILL.md'), '---\nname: demo\ndescription: Demo\n---\n');
  run(work, ['add', '-A']);
  run(work, ['commit', '-q', '-m', 'skill']);
  run(dir, ['clone', '-q', '--bare', work, join(dir, 'repo.git')]);
  servers = spawn(process.execPath, ['-e', SERVERS, log, dir], { stdio: ['ignore', 'pipe', 'inherit'] });
  originPort = await new Promise<string>((resolve) => servers.stdout!.once('data', (chunk: Buffer) => resolve(chunk.toString('utf8').trim())));
});

afterAll(() => {
  servers.kill();
  rmSync(dir, { recursive: true, force: true });
});

describe('URL credentials', () => {
  it('reach the origin of the URL and never a host it redirects to', () => {
    const token = 'SECRET-TOKEN-1';
    let failure: unknown;
    try {
      openGitSource(`http://user:${token}@127.0.0.1:${originPort}/repo.git`, 'test-repo', undefined, 'http').dispose();
    } catch (error) {
      failure = error;
    }
    const requests = readFileSync(log, 'utf8').trim().split('\n').map((line) => JSON.parse(line) as { name: string; auth: string | null });
    const basic = `Basic ${Buffer.from(`user:${token}`).toString('base64')}`;
    expect(requests.filter((r) => r.name === 'origin').map((r) => r.auth)).toContain(basic);
    expect(requests.filter((r) => r.name === 'elsewhere' && r.auth !== null)).toEqual([]);
    // With redirects off the clone stops at the 302, and its message carries no credential.
    expect(failure).toBeInstanceOf(CliError);
    expect(JSON.stringify({ m: (failure as CliError).message, e: (failure as CliError).extra })).not.toContain(token);
  }, 60_000);
});
