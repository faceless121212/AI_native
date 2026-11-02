// Native review pack (Deno): 50 sample replies per language, balanced across the four tone groups
// (care: warm, calm, apologise · play: funny, confident · flirt: flirty with match or partner ·
// clear: sayNoKindly, professional), as one CSV per language for a native speaker to rate 1–5 and comment
// (spec §11). Inputs: evals/review/messages.jsonl (synthetic messages, never real user text).
// Replies go through the same in-process handler and pipeline as the evals (evals/lib/harness.ts).
//
//   deno run --no-lock --config supabase/functions/deno.json --allow-env --allow-read
//     --allow-write=evals/review-packs --allow-net scripts/export-review-pack.ts
//     [--provider fake|anthropic|bedrock|mistral] [--lang de] [--per-lang 50] [--out <dir>]
//   (npm run review-pack -- …). --out must be a folder under evals/review-packs/ (Deno write
//   permission); anything else is refused.
//
// Writes <out>/<lang>.csv (default out: evals/review-packs/<date>-<prompt version>-<provider>/).
// With --provider fake the replies are canned test lines, not model output: every row says so.
// Fixes from the reviews go into supabase/functions/_shared/prompts/lang/<lang>.v2.md as examples
// or banned phrases.
import { parseArgs } from 'node:util';
import { z } from 'zod';
import {
  TONE_GROUP,
  TONE_GROUPS,
  PROMPT_VERSION,
  type ToneGroup,
} from '../supabase/functions/_shared/prompts/index.ts';
import {
  Closeness,
  Formality,
  type Gender,
  Lang,
  Relationship,
  type Tone,
} from '../supabase/functions/_shared/schemas.ts';
import type { EvalCase } from '../evals/lib/cases.ts';
import { EVAL_PROVIDERS, type EvalProvider, Harness, makeProviders } from '../evals/lib/harness.ts';

const { values: args } = parseArgs({
  args: Deno.args,
  options: {
    provider: { type: 'string', default: 'fake' },
    lang: { type: 'string' },
    'per-lang': { type: 'string', default: '50' },
    out: { type: 'string' },
  },
});
if (!(EVAL_PROVIDERS as readonly string[]).includes(args.provider)) {
  console.error(`--provider must be one of ${EVAL_PROVIDERS.join(', ')}`);
  Deno.exit(2);
}
const provider = args.provider as EvalProvider;
const perLang = Number(args['per-lang']);
const fake = provider === 'fake';

const ReviewMessageSchema = z.strictObject({
  lang: Lang,
  group: z.enum(['care', 'play', 'flirt', 'clear']),
  relationship: Relationship,
  closeness: Closeness,
  formality: Formality,
  text: z.string().min(1).max(1000),
});
type ReviewMessage = z.infer<typeof ReviewMessageSchema>;

const root = new URL('..', import.meta.url);
const messages: ReviewMessage[] = (
  await Deno.readTextFile(new URL('evals/review/messages.jsonl', root))
)
  .split('\n')
  .filter((l) => l.trim() !== '')
  .map((l) => ReviewMessageSchema.parse(JSON.parse(l)));

const TONES_BY_GROUP = Object.entries(TONE_GROUP).reduce(
  (acc, [tone, group]) => {
    acc[group].push(tone as Tone);
    return acc;
  },
  { care: [], play: [], flirt: [], clear: [] } as Record<ToneGroup, Tone[]>,
);
const GENDERS: Gender[] = ['woman', 'man', 'unspecified'];

const providers = await makeProviders(provider, (name) => Deno.env.get(name)).catch((err) => {
  console.error(
    `${(err as Error).message}. Set the provider's keys in this shell (see the header comment).`,
  );
  Deno.exit(2);
});
const harness = new Harness(providers, provider);
const model = providers[0]!.model;
const date = new Date().toISOString().slice(0, 10);
// --out must stay under evals/review-packs/: that is the only place the npm script lets Deno
// write (--allow-write=evals/review-packs), and it keeps packs out of the rest of the repo.
const packsRoot = new URL('evals/review-packs/', root);
const outDir = args.out
  ? new URL(`${args.out.replace(/\/?$/, '/')}`, `file://${Deno.cwd()}/`)
  : new URL(`${date}-${PROMPT_VERSION}-${provider}/`, packsRoot);
if (!outDir.href.startsWith(packsRoot.href) || outDir.href.includes('/../')) {
  console.error(`--out must be a folder under ${packsRoot.pathname} (Deno may only write there).`);
  Deno.exit(2);
}
await Deno.mkdir(outDir, { recursive: true });

const HEADER = [
  'row',
  'lang',
  'tone_group',
  'tone',
  'relationship',
  'closeness',
  'formality',
  'flirt',
  'i_am',
  'they_are',
  'their_message',
  'suggested_reply',
  'output_source',
  'prompt_version',
  'provider_model',
  'rating_1_to_5',
  'what_sounds_wrong',
  'how_a_native_would_say_it',
];

function csvField(value: string | number): string {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const langs = args.lang ? [Lang.parse(args.lang)] : Lang.options;
for (const lang of langs) {
  const groups = TONE_GROUPS;
  // Balanced quota per group: 50 → 13 / 13 / 12 / 12.
  const quota = groups.map(
    (_, i) => Math.floor(perLang / groups.length) + (i < perLang % groups.length ? 1 : 0),
  );
  const rows: string[][] = [];
  let run = 0;
  for (const [gi, group] of groups.entries()) {
    const pool = messages.filter((m) => m.lang === lang && m.group === group);
    if (pool.length === 0)
      throw new Error(`evals/review/messages.jsonl: no ${lang} ${group} messages`);
    let got = 0;
    let attempt = 0;
    while (got < quota[gi]! && attempt < quota[gi]! * 3) {
      const msg = pool[attempt % pool.length]!;
      const tones = TONES_BY_GROUP[group].filter(
        (t) => t !== 'flirty' || msg.relationship === 'match' || msg.relationship === 'partner',
      );
      // Rotate tones across messages so every tone of the group appears.
      const tone = tones[(attempt + Math.floor(attempt / pool.length)) % tones.length]!;
      const flirtAllowed = msg.relationship === 'match' || msg.relationship === 'partner';
      const flirt = tone === 'flirty' && flirtAllowed ? (attempt % 2 ? 'playful' : 'light') : 'off';
      const iAm = GENDERS[run % 3]!;
      const theyAre = GENDERS[(run + 1) % 3]!;
      attempt++;
      run++;
      const c: EvalCase = {
        id: `review-${lang}-${run}`,
        kind: 'reply',
        lang,
        text: msg.text,
        chips: {
          relationship: msg.relationship,
          closeness: msg.closeness,
          tone,
          flirt,
          formality: msg.formality,
          iAm,
          theyAre,
          uiLang: 'en',
        },
        tags: [],
        expect: {
          lang,
          formality: msg.formality,
          maxChars: 300,
          mustNot: [],
          crisis: false,
          refused: false,
        },
      };
      const result = await harness.run(c);
      for (const card of result.cards) {
        if (got >= quota[gi]!) break;
        got++;
        rows.push([
          String(rows.length + 1),
          lang,
          group,
          tone,
          msg.relationship,
          String(msg.closeness),
          msg.formality,
          flirt,
          iAm,
          theyAre,
          msg.text,
          card.text,
          fake ? 'FAKE canned test line, not model output: do not review' : 'model',
          PROMPT_VERSION,
          `${provider}/${model}`,
          '',
          '',
          '',
        ]);
      }
    }
    if (got < quota[gi]!)
      console.warn(
        `${lang} ${group}: only ${got} of ${quota[gi]} replies (refusals or dropped cards)`,
      );
  }
  const csv = [HEADER, ...rows].map((r) => r.map(csvField).join(',')).join('\r\n');
  const file = new URL(`${lang}.csv`, outDir);
  // BOM so spreadsheet apps open the accents correctly.
  await Deno.writeTextFile(file, `﻿${csv}\r\n`);
  console.log(`${lang}: ${rows.length} replies → ${file.pathname}`);
}
if (fake) {
  console.log(
    '\nFAKE PROVIDER: these files contain canned test lines, not model output. Do not send them to reviewers; rerun with --provider anthropic|bedrock|mistral.',
  );
}
