import { afterEach, expect, it, vi } from 'vitest';
import { fetchSharedBuild, isBuildId, normalizeBuildId, publishBuild } from './buildSharing';
import { DEFAULT_BUILD } from './game/config';
import { WORDS, randomBuildId } from '../worker/words';
afterEach(() => vi.unstubAllGlobals());
it('accepts memorable three-word IDs and normalizes pasted spaces or dashes', () => {
  expect(normalizeBuildId(' HORSE staple-Battery ')).toBe('horse_staple_battery');
  expect(isBuildId('horse_staple_battery')).toBe(true);
  expect(isBuildId('horse/battery')).toBe(false);
  expect(new Set(WORDS).size).toBe(WORDS.length);
  expect(WORDS.length).toBeGreaterThan(200);
  for (let i = 0; i < 20; i++) expect(isBuildId(randomBuildId())).toBe(true);
});
it('rejects invalid IDs before requesting a build', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(fetchSharedBuild('wrong')).rejects.toThrow('three-word');
  expect(fetch).not.toHaveBeenCalled();
});
it('loads only validated build data and keeps useful server errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ build: { version: 2, attachments: [{ partId: 'unknown' }] } }),
        ),
      ),
  );
  await expect(fetchSharedBuild('horse_staple_battery')).rejects.toThrow('could not be loaded');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'Build ID not found.' }), { status: 404 }),
      ),
  );
  await expect(fetchSharedBuild('horse_staple_battery')).rejects.toThrow('Build ID not found.');
});
it('reports offline failures without pretending a saved build has a share ID', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')));
  await expect(publishBuild(DEFAULT_BUILD)).rejects.toThrow('Check your connection');
});
it('preserves retry timing when build sharing is rate limited', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(new Response('{}', { status: 429, headers: { 'Retry-After': '60' } })),
  );
  await expect(publishBuild(DEFAULT_BUILD)).rejects.toMatchObject({ retryAfterMs: 60000 });
});
