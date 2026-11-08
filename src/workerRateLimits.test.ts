import { expect, it, vi } from 'vitest';
import worker from '../worker/index';
import { DEFAULT_BUILD } from './game/config';
function environment() {
  const allowed = () => ({ limit: vi.fn().mockResolvedValue({ success: true }) });
  const first = vi.fn().mockResolvedValue(null),
    run = vi.fn().mockResolvedValue({ success: true });
  const statement = { bind: vi.fn().mockReturnThis(), first, run };
  const env = {
    API_LIMIT: allowed(),
    BUILD_WRITE_LIMIT: allowed(),
    DB_READ_LIMIT: allowed(),
    DB_WRITE_LIMIT: allowed(),
    BUILD_DB: { prepare: vi.fn().mockReturnValue(statement) },
    ASSETS: { fetch: vi.fn() },
  };
  return { env, first, run };
}
const call = (env: ReturnType<typeof environment>['env'], request: Request) =>
  worker.fetch(request as Parameters<typeof worker.fetch>[0], env as unknown as Env);
it('rejects API floods with retry guidance before touching D1', async () => {
  const { env } = environment();
  env.API_LIMIT.limit.mockResolvedValue({ success: false });
  const response = await call(
    env,
    new Request('https://game.test/api/builds/horse_staple_battery'),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get('Retry-After')).toBe('60');
  expect(env.BUILD_DB.prepare).not.toHaveBeenCalled();
});
it('checks the shared read budget before executing any database query', async () => {
  const { env } = environment();
  env.DB_READ_LIMIT.limit.mockResolvedValue({ success: false });
  const response = await call(
    env,
    new Request('https://game.test/api/builds/horse_staple_battery'),
  );
  expect(response.status).toBe(429);
  expect(env.BUILD_DB.prepare).not.toHaveBeenCalled();
});
it('checks the shared write budget before any INSERT', async () => {
  const { env, run, first } = environment();
  env.DB_WRITE_LIMIT.limit.mockResolvedValue({ success: false });
  const response = await call(
    env,
    new Request('https://game.test/api/builds', {
      method: 'POST',
      body: JSON.stringify(DEFAULT_BUILD),
    }),
  );
  expect(response.status).toBe(429);
  expect(first).toHaveBeenCalledTimes(1);
  expect(run).not.toHaveBeenCalled();
});
it('does not rate-limit static game assets or spend database quota on them', async () => {
  const { env } = environment();
  env.ASSETS.fetch.mockResolvedValue(new Response('game'));
  expect((await call(env, new Request('https://game.test/assets/game.js'))).status).toBe(200);
  expect(env.API_LIMIT.limit).not.toHaveBeenCalled();
  expect(env.BUILD_DB.prepare).not.toHaveBeenCalled();
});
