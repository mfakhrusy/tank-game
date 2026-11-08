import { validBuild } from '../src/buildValidation';
import { randomBuildId } from './words';

class RateLimited extends Error {}
const limited = () =>
  Response.json(
    { code: 'rate_limited', error: 'Too many requests. Please wait a minute and try again.' },
    { status: 429, headers: { 'Retry-After': '60', 'Cache-Control': 'no-store' } },
  );
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
async function readBody(request: Request) {
  if (!request.body) throw new Error('invalid');
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 16384) {
      await reader.cancel();
      throw new Error('large');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== '/api/builds' && !url.pathname.startsWith('/api/builds/'))
      return env.ASSETS.fetch(request);
    try {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      if (!(await env.API_LIMIT.limit({ key: ip })).success) return limited();
      if (request.method === 'POST' && !(await env.BUILD_WRITE_LIMIT.limit({ key: ip })).success)
        return limited();
      let queries = 0;
      const read = async <T>(sql: string, ...values: string[]): Promise<T | null> => {
        if (++queries > 7 || !(await env.DB_READ_LIMIT.limit({ key: 'shared-builds' })).success)
          throw new RateLimited();
        return env.BUILD_DB.prepare(sql)
          .bind(...values)
          .first<T>();
      };
      const write = async (sql: string, ...values: (string | number)[]) => {
        if (++queries > 7 || !(await env.DB_WRITE_LIMIT.limit({ key: 'shared-builds' })).success)
          throw new RateLimited();
        return env.BUILD_DB.prepare(sql)
          .bind(...values)
          .run();
      };
      if (request.method === 'GET' && url.pathname === '/api/builds') return json({ status: 'ok' });
      if (request.method === 'POST' && url.pathname === '/api/builds') {
        let build: unknown;
        try {
          build = await readBody(request);
        } catch (error) {
          return json(
            {
              error:
                error instanceof Error && error.message === 'large'
                  ? 'Build is too large.'
                  : 'Invalid build data.',
            },
            error instanceof Error && error.message === 'large' ? 413 : 400,
          );
        }
        if (!validBuild(build) || !build.name.trim())
          return json({ error: 'Invalid build data.' }, 400);
        // Canonical field order makes retries return the original ID.
        const snapshot = {
          version: 2,
          name: build.name,
          color: build.color,
          attachments: build.attachments.map((a) => ({
            uid: a.uid,
            partId: a.partId,
            mount: a.mount,
            layer: a.layer,
          })),
        };
        const serialized = JSON.stringify(snapshot),
          digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
        const fingerprint = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, '0'),
        ).join('');
        const existing = await read<{ id: string }>(
          'SELECT id FROM shared_builds WHERE fingerprint = ?',
          fingerprint,
        );
        if (existing) return json({ id: existing.id });
        for (let attempt = 0; attempt < 3; attempt++) {
          const id = randomBuildId();
          await write(
            'INSERT OR IGNORE INTO shared_builds (id,fingerprint,build_json,created_at) VALUES (?,?,?,?)',
            id,
            fingerprint,
            serialized,
            Date.now(),
          );
          const stored = await read<{ id: string }>(
            'SELECT id FROM shared_builds WHERE fingerprint = ?',
            fingerprint,
          );
          if (stored) return json({ id: stored.id });
        }
        return json({ error: 'Could not assign a build ID. Please try again.' }, 503);
      }
      if (request.method === 'GET' && url.pathname.startsWith('/api/builds/')) {
        const id = url.pathname.slice('/api/builds/'.length);
        if (!/^[a-z]{2,12}_[a-z]{2,12}_[a-z]{2,12}$/.test(id))
          return json({ error: 'Enter a three-word build ID, like horse_staple_battery.' }, 400);
        const stored = await read<{ build_json: string }>(
          'SELECT build_json FROM shared_builds WHERE id = ?',
          id,
        );
        return stored
          ? json({ id, build: JSON.parse(stored.build_json) })
          : json({ error: 'Build ID not found. Check the three words and try again.' }, 404);
      }
      return json({ error: 'Method not allowed.' }, 405);
    } catch (error) {
      if (error instanceof RateLimited) return limited();
      console.error(
        'build_sharing_failed',
        error instanceof Error ? error.message : 'Unknown error',
      );
      return json({ error: 'Build sharing is temporarily unavailable. Please try again.' }, 503);
    }
  },
} satisfies ExportedHandler<Env>;
