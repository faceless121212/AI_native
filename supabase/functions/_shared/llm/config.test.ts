import { assertEquals } from 'jsr:@std/assert@1';
import {
  BEDROCK_EU_REGIONS,
  createProviders,
  isHosted,
  readLlmConfig,
  regionAllowed,
  UNSAFE_SDK_ENV,
} from './config.ts';

const env = (vars: Record<string, string>) => (name: string) => vars[name];

// Placeholder values only; never real keys.
const LOCAL = { SUPABASE_URL: 'http://kong:8000' };
const HOSTED = { SUPABASE_URL: 'https://abcdefghijklmnop.supabase.co', SB_REGION: 'eu-central-1' };
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

Deno.test(
  'config: hosted detection (SB_REGION or a non-local SUPABASE_URL; unknown = hosted)',
  () => {
    for (const url of [
      'http://kong:8000',
      'http://127.0.0.1:54321',
      'http://localhost:54321',
      'http://host.docker.internal:54321',
    ]) {
      assertEquals(isHosted(env({ SUPABASE_URL: url })), false, url);
    }
    assertEquals(isHosted(env(HOSTED)), true);
    assertEquals(isHosted(env({ SUPABASE_URL: 'https://x.supabase.co' })), true);
    assertEquals(isHosted(env({ ...LOCAL, SB_REGION: 'eu-central-1' })), true);
    assertEquals(isHosted(env({})), true, 'no SUPABASE_URL at all → treat as hosted');
    assertEquals(isHosted(env({ SUPABASE_URL: 'not a url' })), true);
  },
);

Deno.test('config: locally, unset APP_ENV and LLM_MODE mean local + fake', () => {
  assertEquals(chain({ ...LOCAL }), ['fake:fake-v1']);
  assertEquals(chain({ ...LOCAL, APP_ENV: 'staging', LLM_MODE: 'fake' }), ['fake:fake-v1']);
});

Deno.test(
  'config: hosted fails closed (APP_ENV unset = production, local refused, LLM_MODE required)',
  () => {
    assertEquals(chain({ ...HOSTED }), 'missing_llm_mode');
    assertEquals(
      chain({ ...HOSTED, LLM_MODE: 'fake' }),
      'fake_in_production',
      'unset APP_ENV is production',
    );
    assertEquals(chain({ ...HOSTED, APP_ENV: 'local', LLM_MODE: 'fake' }), 'local_on_hosted');
    assertEquals(chain({ ...HOSTED, APP_ENV: 'staging' }), 'missing_llm_mode');
    assertEquals(chain({ ...HOSTED, APP_ENV: 'staging', LLM_MODE: 'fake' }), ['fake:fake-v1']);
    const r = readLlmConfig(
      env({ ...HOSTED, LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'bedrock', ...BEDROCK }),
    );
    assertEquals(r.ok && [r.config.appEnv, r.config.hosted], ['production', true]);
  },
);

Deno.test('config: unknown values are refused', () => {
  assertEquals(chain({ ...LOCAL, APP_ENV: 'prod' }), 'invalid_app_env');
  assertEquals(chain({ ...HOSTED, APP_ENV: 'Production' }), 'invalid_app_env');
  assertEquals(chain({ ...LOCAL, LLM_MODE: 'real' }), 'invalid_llm_mode');
  assertEquals(chain({ ...HOSTED, APP_ENV: 'staging', LLM_MODE: 'FAKE' }), 'invalid_llm_mode');
});

Deno.test('config: any primary/fallback pair, or a primary alone', () => {
  const all = { ...LOCAL, LLM_MODE: 'live', ...ANTHROPIC, ...BEDROCK, ...MISTRAL };
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
      ...LOCAL,
      LLM_MODE: 'live',
      LLM_PROVIDER_PRIMARY: 'bedrock',
      ...BEDROCK,
      AWS_SECRET_ACCESS_KEY: '',
    }),
  );
  assertEquals(r, { ok: false, code: 'missing_secret', detail: 'AWS_SECRET_ACCESS_KEY' });
  assertEquals(
    chain({ ...LOCAL, LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'anthropic' }),
    'missing_secret',
  );
  assertEquals(
    chain({ ...LOCAL, LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'mistral', MISTRAL_API_KEY: 'k' }),
    'missing_secret',
  );
});

Deno.test('config: Bedrock only in EU member regions, only with an EU inference profile', () => {
  const live = { ...LOCAL, LLM_MODE: 'live', LLM_PROVIDER_PRIMARY: 'bedrock', ...BEDROCK };
  for (const region of BEDROCK_EU_REGIONS)
    assertEquals(chain({ ...live, BEDROCK_REGION: region }).length, 1, region);
  assertEquals(
    [...BEDROCK_EU_REGIONS],
    ['eu-central-1', 'eu-west-1', 'eu-west-3', 'eu-south-1', 'eu-south-2', 'eu-north-1'],
  );
  for (const region of [
    'eu-west-2',
    'eu-central-2',
    'us-east-1',
    'eu-central-1 ',
    'EU-CENTRAL-1',
    'eu-west-9',
  ]) {
    assertEquals(chain({ ...live, BEDROCK_REGION: region }), 'non_eu_bedrock_region', region);
  }
  assertEquals(
    chain({ ...live, BEDROCK_MODEL_ID: 'anthropic.claude-haiku-5-5-v1:0' }),
    'non_eu_bedrock_model',
  );
  assertEquals(
    chain({ ...live, BEDROCK_MODEL_ID: 'us.anthropic.claude-haiku-5-5-v1:0' }),
    'non_eu_bedrock_model',
  );
  assertEquals(
    chain({ ...live, BEDROCK_MODEL_ID: 'global.anthropic.claude-haiku-5-5-v1:0' }),
    'non_eu_bedrock_model',
  );
});

Deno.test('config: production never uses anthropic or fake; there is no override', () => {
  const prod = {
    ...HOSTED,
    APP_ENV: 'production',
    LLM_MODE: 'live',
    ...ANTHROPIC,
    ...BEDROCK,
    ...MISTRAL,
  };
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
    chain({ ...prod, LLM_PROVIDER_PRIMARY: 'anthropic', ALLOW_NON_EU_PROVIDER: 'true' }),
    'non_eu_provider',
    'the old escape hatch does nothing',
  );
  assertEquals(chain({ ...prod, LLM_MODE: 'fake' }), 'fake_in_production');
  assertEquals(
    chain({ ...prod, LLM_PROVIDER_PRIMARY: 'bedrock', LLM_PROVIDER_FALLBACK: 'mistral' }).length,
    2,
  );
  // Staging may use it (dev/staging-only processor).
  assertEquals(chain({ ...prod, APP_ENV: 'staging', LLM_PROVIDER_PRIMARY: 'anthropic' }), [
    'anthropic:claude-haiku-5-5',
  ]);
});

Deno.test(
  'config: SDK env variables that redirect, log or trace are refused in staging and production',
  () => {
    const staging = {
      ...HOSTED,
      APP_ENV: 'staging',
      LLM_MODE: 'live',
      LLM_PROVIDER_PRIMARY: 'anthropic',
      ...ANTHROPIC,
    };
    for (const name of ['ANTHROPIC_LOG', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_BEDROCK_BASE_URL']) {
      assertEquals(readLlmConfig(env({ ...staging, [name]: 'debug' })), {
        ok: false,
        code: 'unsafe_sdk_env',
        detail: name,
      });
    }
    for (const name of UNSAFE_SDK_ENV) {
      assertEquals(chain({ ...staging, [name]: 'x' }), 'unsafe_sdk_env', name);
      assertEquals(
        chain({
          ...HOSTED,
          LLM_MODE: 'live',
          LLM_PROVIDER_PRIMARY: 'bedrock',
          ...BEDROCK,
          [name]: 'x',
        }),
        'unsafe_sdk_env',
        `production ${name}`,
      );
    }
    // Local development may set them (clients ignore them anyway: logging off, fixed base URL).
    assertEquals(chain({ ...LOCAL, ANTHROPIC_LOG: 'debug' }), ['fake:fake-v1']);
  },
);

Deno.test('config: production runs only in eu-central-1 (SB_REGION); other envs anywhere', () => {
  assertEquals(regionAllowed('production', env({ SB_REGION: 'eu-central-1' })), true);
  assertEquals(regionAllowed('production', env({ SB_REGION: 'eu-west-1' })), false);
  assertEquals(regionAllowed('production', env({})), false, 'unknown region → refused');
  assertEquals(regionAllowed('staging', env({ SB_REGION: 'us-east-1' })), true);
  assertEquals(regionAllowed('local', env({})), true);
});

Deno.test('config: providers are created only for the configured chain', async () => {
  const r = readLlmConfig(
    env({
      ...LOCAL,
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
