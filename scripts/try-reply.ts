// Try the `reply` Edge Function from the terminal and print the SSE stream.
//
//   node scripts/try-reply.ts [--text "Hey, wie war dein Wochenende?"] [--lang de] [--kind reply|polish]
//        [--relationship friend] [--tone warm] [--flirt off] [--formality casual] [--closeness 3]
//        [--ui-lang en] [--source app] [--jwt <token> | --device-key <key>]
//        [--staging-ref <project ref> (with SUPABASE_URL=https://<ref>.supabase.co)]
//   node scripts/try-reply.ts --measure 10 --lang de|all     p50/p95 time to first card and to done
//
// Defaults: the local stack (`supabase start` + `supabase functions serve`), URL and anon key from
// SUPABASE_URL / SUPABASE_ANON_KEY or `supabase status -o env`. Without --jwt/--device-key it signs
// in anonymously, confirms 18+ and grants AI consent (local and staging test users only).
// Cost per request needs the service-role key (SUPABASE_SERVICE_ROLE_KEY) to read ai_requests;
// without it, only latency is reported. Fake-mode markers work in --text, e.g. "[[fake:slow]]".
// Prints replies to this terminal only; never writes them anywhere.
// Safety: runs only against the local stack, or a staging project named explicitly with
// --staging-ref whose ref matches the URL. Never production (it signs up test users and grants
// consent): if REPLYWISE_PRODUCTION_REF is set, that ref is refused too.
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { CURRENT_AI_POLICY_VERSION } from '../supabase/functions/_shared/policy.ts';
import {
  type LangHint,
  type ReplyRequest,
  SseEventPayloads,
  type SseEventName,
} from '../supabase/functions/_shared/schemas.ts';
import { readSse } from '../supabase/functions/_shared/sse.ts';

const SAMPLES: Record<'en' | 'de' | 'fr' | 'es' | 'it', string> = {
  en: 'Hey! How was your weekend? I finally tried that new pizza place.',
  de: 'Hey, wie war dein Wochenende? Ich war endlich in dem neuen Café.',
  fr: "Coucou ! Ton week-end s'est bien passé ? J'ai enfin testé le nouveau resto.",
  es: '¡Hola! ¿Qué tal el finde? Por fin fui al restaurante nuevo.',
  it: 'Ciao! Com’è andato il weekend? Finalmente ho provato quel ristorante nuovo.',
};

const { values: args } = parseArgs({
  options: {
    text: { type: 'string' },
    lang: { type: 'string', default: 'de' },
    kind: { type: 'string', default: 'reply' },
    relationship: { type: 'string', default: 'friend' },
    tone: { type: 'string', default: 'warm' },
    flirt: { type: 'string', default: 'off' },
    formality: { type: 'string', default: 'casual' },
    closeness: { type: 'string', default: '3' },
    'ui-lang': { type: 'string', default: 'en' },
    source: { type: 'string', default: 'app' },
    url: { type: 'string' },
    'staging-ref': { type: 'string' },
    jwt: { type: 'string' },
    'device-key': { type: 'string' },
    measure: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (args.help) {
  console.log('See the comment at the top of scripts/try-reply.ts.');
  process.exit(0);
}

function localStatus(): Record<string, string> {
  try {
    const out = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return Object.fromEntries(
      out
        .split('\n')
        .map((line) => /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim()))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => [m[1]!, m[2]!]),
    );
  } catch {
    return {};
  }
}

const status = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY ? {} : localStatus();
const supabaseUrl = (
  process.env.SUPABASE_URL ??
  status.API_URL ??
  'http://127.0.0.1:54321'
).replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY ?? status.ANON_KEY ?? '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const functionsUrl = (args.url ?? `${supabaseUrl}/functions/v1`).replace(/\/$/, '');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function refuse(message: string): never {
  console.error(`try-reply: ${message}`);
  process.exit(2);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return refuse(`not a URL: ${url}`);
  }
}

{
  const hosts = [hostOf(supabaseUrl), hostOf(functionsUrl)];
  const stagingRef = args['staging-ref'];
  if (!hosts.every((h) => LOCAL_HOSTS.has(h))) {
    if (!stagingRef || !/^[a-z0-9]{20}$/.test(stagingRef)) {
      refuse('only the local stack, or a staging project named with --staging-ref <20-char ref>.');
    }
    if (stagingRef === process.env.REPLYWISE_PRODUCTION_REF)
      refuse('that is the production project.');
    const expected = `${stagingRef}.supabase.co`;
    if (!hosts.every((h) => h === expected)) {
      refuse(`--staging-ref ${stagingRef} does not match the URL (expected host ${expected}).`);
    }
  }
}

// Pin the invocation to Frankfurt (hosted projects; ignored locally).
const REGION = { 'x-region': 'eu-central-1' };

async function json(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function signInAndConsent(): Promise<string> {
  const signup = await fetch(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: '{}',
  });
  if (!signup.ok)
    throw new Error(
      `Anonymous sign-in failed: ${signup.status} ${JSON.stringify(await json(signup))}`,
    );
  const token = ((await signup.json()) as { access_token: string }).access_token;
  const auth = {
    authorization: `Bearer ${token}`,
    apikey: anonKey,
    'content-type': 'application/json',
    ...REGION,
  };
  const profile = await fetch(`${functionsUrl}/profile`, {
    method: 'PATCH',
    headers: auth,
    body: JSON.stringify({
      ageConfirmed: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }),
  });
  if (!profile.ok)
    throw new Error(`profile: ${profile.status} ${JSON.stringify(await json(profile))}`);
  const consent = await fetch(`${functionsUrl}/consent`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ action: 'grant', policyVersion: CURRENT_AI_POLICY_VERSION }),
  });
  if (!consent.ok)
    throw new Error(`consent: ${consent.status} ${JSON.stringify(await json(consent))}`);
  console.error('Signed in anonymously, 18+ confirmed, AI consent granted.');
  return token;
}

const authorization = args['device-key']
  ? `Device ${args['device-key']}`
  : `Bearer ${args.jwt ?? (await signInAndConsent())}`;

interface RunResult {
  requestId: string | null;
  status: number;
  firstCardMs: number | null;
  doneMs: number | null;
  cards: number;
  error: string | null;
}

async function runOnce(lang: LangHint, text: string, print: boolean): Promise<RunResult> {
  const body: ReplyRequest = {
    kind: args.kind as ReplyRequest['kind'],
    text,
    langHint: lang,
    relationship: args.relationship as ReplyRequest['relationship'],
    closeness: Number(args.closeness),
    tone: args.tone as ReplyRequest['tone'],
    flirt: args.flirt as ReplyRequest['flirt'],
    formality: args.formality as ReplyRequest['formality'],
    iAm: 'unspecified',
    theyAre: 'unspecified',
    uiLang: args['ui-lang'] as ReplyRequest['uiLang'],
    source: args.source as ReplyRequest['source'],
    clientRequestId: crypto.randomUUID(),
  };
  const started = performance.now();
  const res = await fetch(`${functionsUrl}/reply`, {
    method: 'POST',
    headers: {
      authorization,
      apikey: anonKey,
      'content-type': 'application/json',
      accept: 'text/event-stream',
      ...REGION,
    },
    body: JSON.stringify(body),
  });
  const result: RunResult = {
    requestId: res.headers.get('x-request-id'),
    status: res.status,
    firstCardMs: null,
    doneMs: null,
    cards: 0,
    error: null,
  };
  if (!res.ok || !res.body) {
    const err = await json(res);
    result.error =
      typeof err === 'object' && err && 'error' in err ? String(err.error) : `http_${res.status}`;
    if (print) console.log(`HTTP ${res.status}`, err);
    return result;
  }
  for await (const msg of readSse(res.body)) {
    const ms = Math.round(performance.now() - started);
    const name = msg.event as SseEventName;
    const schema = SseEventPayloads[name];
    const data: unknown = JSON.parse(msg.data);
    const valid = schema ? schema.safeParse(data).success : false;
    if (name === 'card') {
      result.cards++;
      result.firstCardMs ??= ms;
    }
    if (name === 'done') result.doneMs = ms;
    if (name === 'error') result.error = (data as { error: string }).error;
    if (print) {
      const tag = valid ? '' : '  (does not match the schema!)';
      if (name === 'card') {
        const card = data as { index: number; variant: string; text: string };
        console.log(
          `${String(ms).padStart(5)} ms  card ${card.index} [${card.variant}]  ${card.text}${tag}`,
        );
      } else {
        console.log(
          `${String(ms).padStart(5)} ms  ${name.padEnd(5)} ${JSON.stringify(data)}${tag}`,
        );
      }
    }
  }
  return result;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  ]!;
}

interface CostRow {
  id: string;
  provider: string | null;
  model: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_micro_eur: number;
}

async function costs(ids: string[]): Promise<CostRow[] | null> {
  if (!serviceKey || ids.length === 0) return null;
  const res = await fetch(
    `${supabaseUrl}/rest/v1/ai_requests?select=id,provider,model,tokens_in,tokens_out,cost_micro_eur&id=in.(${ids.join(',')})`,
    { headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` } },
  );
  return res.ok ? ((await res.json()) as CostRow[]) : null;
}

if (args.measure) {
  const n = Number(args.measure);
  const langs = (
    args.lang === 'all' ? Object.keys(SAMPLES) : [args.lang]
  ) as (keyof typeof SAMPLES)[];
  console.log(
    `Measuring ${n} request(s) per language against ${functionsUrl}/reply (sequential, ≤ 20/min).`,
  );
  const rows: string[] = [];
  for (const lang of langs) {
    const results: RunResult[] = [];
    for (let i = 0; i < n; i++) {
      const r = await runOnce(lang, args.text ?? SAMPLES[lang] ?? SAMPLES.en, false);
      results.push(r);
      if (
        r.error === 'quota_empty' ||
        r.error === 'fair_use' ||
        r.error === 'ai_off' ||
        r.status === 401
      ) {
        console.error(
          `Stopped: ${r.error ?? r.status}. Use --jwt of a user with a plan for larger runs.`,
        );
        break;
      }
      if (r.error === 'rate') await new Promise((done) => setTimeout(done, 60_000));
      else await new Promise((done) => setTimeout(done, 3_100)); // stay under 20/min
    }
    const ok = results.filter((r) => r.error === null);
    const first = ok.map((r) => r.firstCardMs).filter((v): v is number => v !== null);
    const done = ok.map((r) => r.doneMs).filter((v): v is number => v !== null);
    const costRows = await costs(ok.map((r) => r.requestId).filter((v): v is string => v !== null));
    const avgCost =
      costRows && costRows.length
        ? costRows.reduce((a, c) => a + c.cost_micro_eur, 0) / costRows.length
        : null;
    const models = costRows
      ? [...new Set(costRows.map((c) => `${c.provider}/${c.model}`))].join(', ')
      : 'n/a';
    rows.push(
      [
        lang,
        `${ok.length}/${results.length} ok`,
        `first card p50 ${percentile(first, 50) ?? '–'} ms, p95 ${percentile(first, 95) ?? '–'} ms`,
        `done p50 ${percentile(done, 50) ?? '–'} ms, p95 ${percentile(done, 95) ?? '–'} ms`,
        avgCost === null
          ? 'cost n/a (set SUPABASE_SERVICE_ROLE_KEY)'
          : `cost €${(avgCost / 1e6).toFixed(6)}/request`,
        models,
      ].join(' | '),
    );
  }
  console.log(rows.join('\n'));
} else {
  const lang = args.lang as keyof typeof SAMPLES;
  const r = await runOnce(lang, args.text ?? SAMPLES[lang] ?? SAMPLES.en, true);
  if (r.requestId) console.error(`request ${r.requestId}`);
  process.exitCode = r.error ? 1 : 0;
}
