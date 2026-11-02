// LLM configuration from Edge Function secrets. Pure: takes an env reader, returns the provider
// chain (primary, then optional fallback) or a config error code. Fails closed: anything missing,
// unknown or unsafe refuses the configuration (the function then answers 500 / health 503).
//
//   APP_ENV                local | staging | production
//                          Unset: production when running hosted (see isHosted), local otherwise.
//                          `local` is refused when hosted.
//   LLM_MODE               fake | live. Unset: fake locally, refused when hosted.
//   LLM_PROVIDER_PRIMARY   bedrock | mistral | anthropic        (live: required)
//   LLM_PROVIDER_FALLBACK  bedrock | mistral | anthropic        (optional, ≠ primary)
//   anthropic: ANTHROPIC_API_KEY, ANTHROPIC_MODEL (default claude-haiku-5-5)
//   bedrock:   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, BEDROCK_REGION (EU member region, see
//              BEDROCK_EU_REGIONS), BEDROCK_MODEL_ID (EU inference profile, "eu.…")
//   mistral:   MISTRAL_API_KEY, MISTRAL_MODEL
//
// Production never uses `fake` or `anthropic` (the direct Claude API has no EU-only processing;
// CLAUDE.md rule 5). There is no override.
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
  | 'local_on_hosted'
  | 'invalid_llm_mode'
  | 'missing_llm_mode'
  | 'fake_in_production'
  | 'missing_primary'
  | 'invalid_provider'
  | 'same_provider_twice'
  | 'missing_secret'
  | 'non_eu_provider'
  | 'non_eu_bedrock_region'
  | 'non_eu_bedrock_model'
  | 'unsafe_sdk_env';

/**
 * Bedrock regions allowed as the inference-profile source: EU member states only. Not
 * eu-west-2 (London) or eu-central-2 (Zurich): outside the EU.
 */
export const BEDROCK_EU_REGIONS = [
  'eu-central-1', // Frankfurt
  'eu-west-1', // Ireland
  'eu-west-3', // Paris
  'eu-south-1', // Milan
  'eu-south-2', // Spain
  'eu-north-1', // Stockholm
] as const;

/**
 * SDK environment variables that can redirect traffic, add headers or credentials, or log /
 * trace request content (the Anthropic SDKs read them on their own). Refused in staging and
 * production; the clients are also built with logging off and an explicit base URL.
 */
export const UNSAFE_SDK_ENV = [
  'ANTHROPIC_LOG',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_BEDROCK_BASE_URL',
  'ANTHROPIC_BEDROCK_MANTLE_BASE_URL',
  'ANTHROPIC_CUSTOM_HEADERS',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_PROFILE',
  'ANTHROPIC_CONFIG_DIR',
  'ANTHROPIC_OPEN_TELEMETRY',
  'ANTHROPIC_OPEN_TELEMETRY_PROPAGATION',
  'ANTHROPIC_OPEN_TELEMETRY_TRACES_CONTENT_MODE',
  'ANTHROPIC_OPEN_TELEMETRY_TRACES_MAX_CONTENT_BYTES',
  'AWS_BEARER_TOKEN_BEDROCK',
] as const;

/** The only region `reply` may run in when APP_ENV=production. */
export const REQUIRED_FUNCTION_REGION = 'eu-central-1';

export interface ProviderSpec {
  name: ProviderName;
  model: string;
  create(): Promise<LlmProvider>;
}

export interface LlmConfig {
  appEnv: AppEnv;
  hosted: boolean;
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

const LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'kong',
  'host.docker.internal',
]);

/**
 * True when running on Supabase's hosted Edge Runtime rather than the local stack. Signals:
 * SB_REGION is set (the hosted runtime sets it; local serve doesn't), or SUPABASE_URL points at
 * anything but a local host. Unknown → hosted (fail closed).
 */
export function isHosted(env: EnvReader): boolean {
  if (env('SB_REGION')) return true;
  const url = env('SUPABASE_URL');
  if (!url) return true;
  try {
    return !LOCAL_HOSTS.has(new URL(url).hostname);
  } catch {
    return true;
  }
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
      if (!(BEDROCK_EU_REGIONS as readonly string[]).includes(region)) {
        return fail('non_eu_bedrock_region', 'BEDROCK_REGION') as SpecResult;
      }
      if (!model.startsWith('eu.')) {
        return fail('non_eu_bedrock_model', 'BEDROCK_MODEL_ID') as SpecResult;
      }
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
  const hosted = isHosted(env);
  const rawAppEnv = env('APP_ENV') || (hosted ? 'production' : 'local');
  if (rawAppEnv !== 'local' && rawAppEnv !== 'staging' && rawAppEnv !== 'production') {
    return fail('invalid_app_env', 'APP_ENV');
  }
  const appEnv: AppEnv = rawAppEnv;
  if (hosted && appEnv === 'local') return fail('local_on_hosted', 'APP_ENV');

  if (appEnv !== 'local') {
    const unsafe = UNSAFE_SDK_ENV.find((name) => env(name) !== undefined && env(name) !== '');
    if (unsafe) return fail('unsafe_sdk_env', unsafe);
  }

  const rawMode = env('LLM_MODE');
  if (!rawMode && hosted) return fail('missing_llm_mode', 'LLM_MODE');
  const mode = rawMode || 'fake';
  if (mode !== 'fake' && mode !== 'live') return fail('invalid_llm_mode', 'LLM_MODE');

  if (mode === 'fake') {
    // Production must never answer users with canned lines.
    if (appEnv === 'production') return fail('fake_in_production', 'LLM_MODE');
    const fake = new FakeProvider();
    return {
      ok: true,
      config: {
        appEnv,
        hosted,
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
    if (!isLive(name)) {
      return fail(
        'invalid_provider',
        name === primary ? 'LLM_PROVIDER_PRIMARY' : 'LLM_PROVIDER_FALLBACK',
      );
    }
  }
  if (fallback === primary) return fail('same_provider_twice', 'LLM_PROVIDER_FALLBACK');

  // Privacy (spec §10 "processed in the EU", CLAUDE.md rule 5): the direct Claude API offers no
  // EU-only processing, so production never uses it. No override.
  if (appEnv === 'production' && names.includes('anthropic')) {
    return fail('non_eu_provider', 'anthropic');
  }

  const chain: ProviderSpec[] = [];
  for (const name of names as LiveProviderName[]) {
    const result = liveSpec(name, env);
    if (!result.ok) return result;
    chain.push(result.spec);
  }
  return { ok: true, config: { appEnv, hosted, mode, chain } };
}

/**
 * Region pinning (architecture §7, inventory: invoke reply in Frankfurt). In production the
 * function must run in eu-central-1, read from SB_REGION, which Supabase's hosted Edge Runtime
 * sets to the region serving the invocation (Supabase docs, "Regional invocations"; confirm on
 * the first production deploy). Missing or different → not ok (fail closed). Other envs: ok.
 */
export function regionAllowed(appEnv: AppEnv, env: EnvReader): boolean {
  if (appEnv !== 'production') return true;
  return env('SB_REGION') === REQUIRED_FUNCTION_REGION;
}

/** Creates the configured providers (primary first). Only configured SDKs are imported. */
export function createProviders(config: LlmConfig): Promise<LlmProvider[]> {
  return Promise.all(config.chain.map((spec) => spec.create()));
}
