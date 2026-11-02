// LLM configuration from Edge Function secrets. Pure: takes an env reader, returns the provider
// chain (primary, then optional fallback) or a config error code. Providers are created lazily
// (dynamic import), so an unused SDK is never loaded.
//
//   APP_ENV                local | staging | production         (default local)
//   LLM_MODE               fake | live                          (default fake; production must be live)
//   LLM_PROVIDER_PRIMARY   bedrock | mistral | anthropic        (live: required)
//   LLM_PROVIDER_FALLBACK  bedrock | mistral | anthropic        (optional, ≠ primary)
//   ALLOW_NON_EU_PROVIDER  "true" to allow anthropic in production (it has no EU-only processing)
//   anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-haiku-5-5)
//   bedrock:   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_REGION (eu-*), BEDROCK_MODEL_ID (eu.*)
//   mistral:   MISTRAL_API_KEY, MISTRAL_MODEL
import { FakeProvider } from './fake.ts';
import {
  LIVE_PROVIDER_NAMES,
  type LiveProviderName,
  type LlmProvider,
  type ProviderName,
} from './provider.ts';
import { DEFAULT_ANTHROPIC_MODEL } from './settings.ts';

export type AppEnv = 'local' | 'staging' | 'production';

export type ConfigErrorCode =
  | 'invalid_app_env'
  | 'invalid_llm_mode'
  | 'fake_in_production'
  | 'missing_primary'
  | 'invalid_provider'
  | 'same_provider_twice'
  | 'missing_secret'
  | 'non_eu_provider'
  | 'non_eu_bedrock_region'
  | 'non_eu_bedrock_model';

export interface ProviderSpec {
  name: ProviderName;
  model: string;
  create(): Promise<LlmProvider>;
}

export interface LlmConfig {
  appEnv: AppEnv;
  mode: 'fake' | 'live';
  /** Primary first. */
  chain: ProviderSpec[];
}

export type LlmConfigResult =
  { ok: true; config: LlmConfig } | { ok: false; code: ConfigErrorCode; detail: string | null };

export type EnvReader = (name: string) => string | undefined;

function fail(code: ConfigErrorCode, detail: string | null = null): LlmConfigResult {
  // detail is only ever an env variable or provider *name*, never a value.
  return { ok: false, code, detail };
}

function isLive(name: string): name is LiveProviderName {
  return (LIVE_PROVIDER_NAMES as readonly string[]).includes(name);
}

type SpecResult = { ok: true; spec: ProviderSpec } | Extract<LlmConfigResult, { ok: false }>;

function liveSpec(name: LiveProviderName, env: EnvReader): SpecResult {
  const missing = (variables: string[]): SpecResult | null => {
    const absent = variables.find((v) => !env(v));
    return absent ? (fail('missing_secret', absent) as SpecResult) : null;
  };
  switch (name) {
    case 'anthropic': {
      const err = missing(['ANTHROPIC_API_KEY']);
      if (err) return err;
      const model = env('ANTHROPIC_MODEL') || DEFAULT_ANTHROPIC_MODEL;
      return {
        ok: true,
        spec: {
          name,
          model,
          create: async () => {
            const { AnthropicProvider } = await import('./anthropic.ts');
            return new AnthropicProvider({ apiKey: env('ANTHROPIC_API_KEY')!, model });
          },
        },
      };
    }
    case 'bedrock': {
      const err = missing([
        'AWS_ACCESS_KEY_ID',
        'AWS_SECRET_ACCESS_KEY',
        'BEDROCK_REGION',
        'BEDROCK_MODEL_ID',
      ]);
      if (err) return err;
      const region = env('BEDROCK_REGION')!;
      const model = env('BEDROCK_MODEL_ID')!;
      if (!/^eu-[a-z]+-\d$/.test(region))
        return fail('non_eu_bedrock_region', 'BEDROCK_REGION') as SpecResult;
      if (!model.startsWith('eu.'))
        return fail('non_eu_bedrock_model', 'BEDROCK_MODEL_ID') as SpecResult;
      return {
        ok: true,
        spec: {
          name,
          model,
          create: async () => {
            const { BedrockProvider } = await import('./bedrock.ts');
            return new BedrockProvider({
              region,
              model,
              accessKeyId: env('AWS_ACCESS_KEY_ID')!,
              secretAccessKey: env('AWS_SECRET_ACCESS_KEY')!,
            });
          },
        },
      };
    }
    case 'mistral': {
      const err = missing(['MISTRAL_API_KEY', 'MISTRAL_MODEL']);
      if (err) return err;
      const model = env('MISTRAL_MODEL')!;
      return {
        ok: true,
        spec: {
          name,
          model,
          create: async () => {
            const { MistralProvider } = await import('./mistral.ts');
            return new MistralProvider({ apiKey: env('MISTRAL_API_KEY')!, model });
          },
        },
      };
    }
  }
}

export function readLlmConfig(env: EnvReader): LlmConfigResult {
  const appEnv = env('APP_ENV') || 'local';
  if (appEnv !== 'local' && appEnv !== 'staging' && appEnv !== 'production') {
    return fail('invalid_app_env', 'APP_ENV');
  }
  const mode = env('LLM_MODE') || 'fake';
  if (mode !== 'fake' && mode !== 'live') return fail('invalid_llm_mode', 'LLM_MODE');

  if (mode === 'fake') {
    // Production must never answer users with canned lines.
    if (appEnv === 'production') return fail('fake_in_production', 'LLM_MODE');
    const fake = new FakeProvider();
    return {
      ok: true,
      config: {
        appEnv,
        mode,
        chain: [{ name: 'fake', model: fake.model, create: () => Promise.resolve(fake) }],
      },
    };
  }

  const primary = env('LLM_PROVIDER_PRIMARY');
  if (!primary) return fail('missing_primary', 'LLM_PROVIDER_PRIMARY');
  const fallback = env('LLM_PROVIDER_FALLBACK') || null;
  const names: string[] = fallback ? [primary, fallback] : [primary];
  for (const name of names) {
    if (!isLive(name))
      return fail(
        'invalid_provider',
        name === primary ? 'LLM_PROVIDER_PRIMARY' : 'LLM_PROVIDER_FALLBACK',
      );
  }
  if (fallback === primary) return fail('same_provider_twice', 'LLM_PROVIDER_FALLBACK');

  // Privacy guard (spec §10 "processed in the EU"): the direct Claude API offers no EU-only
  // processing, so production refuses it unless explicitly allowed.
  if (
    appEnv === 'production' &&
    names.includes('anthropic') &&
    env('ALLOW_NON_EU_PROVIDER') !== 'true'
  ) {
    return fail('non_eu_provider', 'anthropic');
  }

  const chain: ProviderSpec[] = [];
  for (const name of names as LiveProviderName[]) {
    const result = liveSpec(name, env);
    if (!result.ok) return result;
    chain.push(result.spec);
  }
  return { ok: true, config: { appEnv, mode, chain } };
}

/** Creates the configured providers (primary first). Only configured SDKs are imported. */
export function createProviders(config: LlmConfig): Promise<LlmProvider[]> {
  return Promise.all(config.chain.map((spec) => spec.create()));
}
