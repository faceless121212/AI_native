import { assertEquals } from 'jsr:@std/assert@1';
import { createProviders, readLlmConfig } from './config.ts';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

// Placeholder values only; never real keys.
const ANTHROPIC = { ANTHROPIC_API_KEY: 'test-anthropic-key' };
const BEDROCK = {
  AWS_ACCESS_KEY_ID: 'test-access',
  AWS_SECRET_ACCESS_KEY: 'test-secret',
  BEDROCK_REGION: 'eu-central-1',
  BEDROCK_MODEL_ID: 'eu.anthropic.claude-haiku-5-5-v1:0',
};
const MISTRAL = { MISTRAL_API_KEY: 'test-mistral-key', MISTRAL_MODEL: 'mistral-small-latest' };

function chain(vars: Record<string, string>) {
  const r = readLlmConfig(env(vars));
  return r.ok ? r.config.chain.map((s) => `${s.name}:${s.model}`) : r.code;
}

Deno.test('config: fake by default (local, CI), never in production', () => {
  assertEquals(chain({}), ['fake:fake-v1']);
  assertEquals(chain({ APP_ENV: 'staging', LLM_MODE: 'fake' }), ['fake:fake-v1']);
  assertEquals(chain({ APP_ENV: 'production' }), 'fake_in_production');
  assertEquals(chain({ APP_ENV: 'prod' }), 'invalid_app_env');
  assertEquals(chain({ LLM_MODE: 'real' }), 'invalid_llm_mode');
});

Deno.test('config: any primary/fallback pair, or a primary alone', () => {
  const all = { LLM_MODE: 'live', ...ANTHROPIC, ...BEDROCK, ...MISTRAL };
  assertEquals(chain({ ...all, LLM_PROVIDER_PRIMARY: 'anthropic' }), [
    'anthropic:claude-haiku-5-5',
  ]);
  assertEquals(
    chain({ ...all, LLM_PROVIDER_PRIMARY: 'anthropic', ANTHROPIC_MODEL: 'claude-sonnet-5-5' }),
    ['anthropic:claude-sonnet-5-5'],
  );
  assertEquals(
    chain({ ...all, LLM_PROVIDER_PRIMARY: 'bedrock', LLM_PROVIDER_FALLBACK: 'mistral' }),
    ['bedrock:eu.anthropic.claude-haiku-5-5-v1:0', 'mistral:mistral-small-latest'],
  );
  assertEquals(
    chain({ ...all, LLM_PROVIDER_PRIMARY: 'mistral', LLM_PROVIDER_FALLBACK: 'anthropic' }),
    ['mistral:mistral-small-latest', 'anthropic:claude-haiku-5-5'],
  );
  assertEquals(chain({ ...all }), 'missing_primary');
  assertEquals(chain({ ...all, LLM_PROVIDER_PRIMARY: 'openai' }), 'invalid_provider');
  assertEquals(chain({ ...all, LLM_PROVIDER_PRIMARY: 'fake' }), 'invalid_provider');
  assertEquals(
    chain({ ...all, LLM_PROVIDER_PRIMARY: 'mistral', LLM_PROVIDER_FALLBACK: 'mistral' }),
    'same_provider_twice',
  );
});

Deno.test('config: missing secrets are named (never their values)', () => {
  const r = readLlmConfig(
    env({
      LLM_MODE: 'live',
      LLM_PROVIDER_PRIMARY: 'bedrock',
      ...BEDROCK,
      AWS_SECRET_ACCESS_KEY: '',
    }),
  );
  assertEquals(r, { ok: false, code: 'missing_secret', detail: 'AWS_SECRET_ACCESS_KEY' });
  assertEquals(chain({ LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'anthropic' }), 'missing_secret');
  assertEquals(
    chain({ LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'mistral', MISTRAL_API_KEY: 'k' }),
    'missing_secret',
  );
});

Deno.test('config: Bedrock must use an EU region and an EU inference profile', () => {
  const live = { LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'bedrock' };
  assertEquals(
    chain({ ...live, ...BEDROCK, BEDROCK_REGION: 'us-east-1' }),
    'non_eu_bedrock_region',
  );
  assertEquals(
    chain({ ...live, ...BEDROCK, BEDROCK_MODEL_ID: 'anthropic.claude-haiku-5-5-v1:0' }),
    'non_eu_bedrock_model',
  );
  assertEquals(
    chain({ ...live, ...BEDROCK, BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-5-5-v1:0' }),
    'non_eu_bedrock_model',
  );
});

Deno.test(
  'config: production refuses the direct Claude API (no EU-only processing) unless explicitly allowed',
  () => {
    const prod = { APP_ENV: 'production', LLM_MODE: 'live', ...ANTHROPIC, ...BEDROCK, ...MISTRAL };
    assertEquals(readLlmConfig(env({ ...prod, LLM_PROVIDER_PRIMARY: 'anthropic' })), {
      ok: false,
      code: 'non_eu_provider',
      detail: 'anthropic',
    });
    assertEquals(
      chain({ ...prod, LLM_PROVIDER_PRIMARY: 'bedrock', LLM_PROVIDER_FALLBACK: 'anthropic' }),
      'non_eu_provider',
    );
    assertEquals(
      chain({ ...prod, LLM_PROVIDER_PRIMARY: 'anthropic', ALLOW_NON_EU_PROVIDER: '1' }),
      'non_eu_provider',
      'only the exact value "true"',
    );
    assertEquals(
      chain({ ...prod, LLM_PROVIDER_PRIMARY: 'anthropic', ALLOW_NON_EU_PROVIDER: 'true' }),
      ['anthropic:claude-haiku-5-5'],
    );
    assertEquals(
      chain({ ...prod, LLM_PROVIDER_PRIMARY: 'bedrock', LLM_PROVIDER_FALLBACK: 'mistral' }).length,
      2,
    );
    // Staging may use it (dev/staging-only processor).
    assertEquals(chain({ ...prod, APP_ENV: 'staging', LLM_PROVIDER_PRIMARY: 'anthropic' }), [
      'anthropic:claude-haiku-5-5',
    ]);
  },
);

Deno.test('config: providers are created only for the configured chain', async () => {
  const r = readLlmConfig(
    env({
      LLM_MODE: 'live',
      LLM_PROVIDER_PRIMARY: 'mistral',
      LLM_PROVIDER_FALLBACK: 'anthropic',
      ...ANTHROPIC,
      ...MISTRAL,
    }),
  );
  if (!r.ok) throw new Error(r.code);
  const providers = await createProviders(r.config);
  assertEquals(
    providers.map((p) => [p.name, p.model]),
    [
      ['mistral', 'mistral-small-latest'],
      ['anthropic', 'claude-haiku-5-5'],
    ],
  );
});
