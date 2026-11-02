// GET /health (no auth): for Better Stack and the app's provider-down banner (v1.providerDown).
//   200 {status:'ok'}        every configured provider is usable
//   200 {status:'degraded'}  the primary or fallback is marked down, another one works
//   503 {status:'down'}      no provider usable, the provider config is refused, or the DB is unreachable
// Returns codes and timestamps only (no provider names, no config detail).
import { jsonResponse, methodNotAllowed } from '../_shared/errors.ts';
import type { ProviderHealth } from '../_shared/llm/health.ts';
import type { ProviderName } from '../_shared/llm/provider.ts';
import { logError, logEvent } from '../_shared/log.ts';
import type { HealthResponse } from '../_shared/schemas.ts';

export interface HealthDeps {
  /** Configured provider names (primary first), or null when the provider config is refused. */
  providers: readonly ProviderName[] | null;
  health: ProviderHealth;
}

export async function handleHealth(req: Request, deps: HealthDeps): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') throw methodNotAllowed(['GET', 'HEAD']);
  const down = (body: HealthResponse) => jsonResponse(body, 503);
  if (!deps.providers || deps.providers.length === 0) {
    logEvent('health', 'config_error');
    return down({ status: 'down', providerDown: true, downUntil: null });
  }
  let until: Array<Date | null>;
  try {
    until = await Promise.all(deps.providers.map((name) => deps.health.downUntil(name)));
  } catch (err) {
    logError('health', 'provider_status', err);
    return down({ status: 'down', providerDown: true, downUntil: null });
  }
  const downTimes = until.filter((d): d is Date => d !== null).map((d) => d.getTime());
  const downUntil = downTimes.length ? new Date(Math.min(...downTimes)).toISOString() : null;
  if (downTimes.length === until.length)
    return down({ status: 'down', providerDown: true, downUntil });
  const body: HealthResponse = {
    status: downTimes.length > 0 ? 'degraded' : 'ok',
    providerDown: false,
    downUntil,
  };
  return jsonResponse(body);
}
