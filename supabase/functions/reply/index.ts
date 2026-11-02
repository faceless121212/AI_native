// reply: the only code that talks to an LLM. verify_jwt is off in config.toml because keyboards
// authenticate with `Authorization: Device <key>`; handleReply authenticates every request itself
// (JWT or device key) before anything else. Invoke it pinned to Frankfurt (x-region: eu-central-1).
import { createServiceClient } from '../_shared/db.ts';
import { withErrors } from '../_shared/http.ts';
import { createProviders, readLlmConfig } from '../_shared/llm/config.ts';
import { CachedProviderHealth } from '../_shared/llm/health.ts';
import { logError, logEvent } from '../_shared/log.ts';
import { RateLimiter } from '../_shared/rate-limit.ts';
import {
  SupabaseProviderStatusStore,
  SupabaseReplyRepo,
  supabaseAuthDeps,
} from '../_shared/repo-supabase.ts';
import { handleReplyRoute, type LlmSetup } from './handler.ts';

const db = createServiceClient();
const config = readLlmConfig((name) => Deno.env.get(name));

let llm: LlmSetup;
if (config.ok) {
  try {
    llm = { ok: true, providers: await createProviders(config.config) };
    logEvent('reply', 'config', {
      app_env: config.config.appEnv,
      mode: config.config.mode,
      chain: config.config.chain.map((s) => s.name).join(','),
      region: Deno.env.get('SB_REGION') ?? null,
    });
  } catch (err) {
    logError('reply', 'provider_init', err);
    llm = { ok: false, code: 'invalid_provider', detail: null };
  }
} else {
  logEvent('reply', 'config_error', { code: config.code, detail: config.detail });
  llm = { ok: false, code: config.code, detail: config.detail };
}

const deps = {
  auth: supabaseAuthDeps(db),
  repo: new SupabaseReplyRepo(db),
  llm,
  health: new CachedProviderHealth(new SupabaseProviderStatusStore(db)),
  rateLimiter: new RateLimiter(),
};

Deno.serve(withErrors('reply', (req) => handleReplyRoute(req, deps)));
