import { createServiceClient } from '../_shared/db.ts';
import { withErrors } from '../_shared/http.ts';
import { readLlmConfig } from '../_shared/llm/config.ts';
import { CachedProviderHealth } from '../_shared/llm/health.ts';
import { SupabaseProviderStatusStore } from '../_shared/repo-supabase.ts';
import { handleHealth } from './handler.ts';

const db = createServiceClient();
const config = readLlmConfig((name) => Deno.env.get(name));
const deps = {
  providers: config.ok ? config.config.chain.map((spec) => spec.name) : null,
  health: new CachedProviderHealth(new SupabaseProviderStatusStore(db)),
};

Deno.serve(withErrors('health', (req) => handleHealth(req, deps)));
