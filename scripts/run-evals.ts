// Eval runner (Deno). Runs every case of an eval set through the real `reply` handler and pipeline
// in-process (evals/lib/harness.ts: in-memory store, no database, no real user data) and writes
//   evals/reports/<date>-<set>-<prompt version>-<provider>.md  (+ .json summary for comparisons)
//
//   npm run evals -- --prompt reply|polish|safety [--provider fake|anthropic|bedrock|mistral]
//                    [--version <one of PROMPT_VERSIONS>] [--case <id>] [--lang <en|de|fr|es|it>]
//                    [--trace] [--fake-scenario <FAKE_SCENARIOS name>]
// --trace prints, per card line, the drop reason and the language scores (codes and numbers
// only, never card text) to stdout. --fake-scenario replaces each case's fake scenario
// (--provider fake only), e.g. lang-it-metalast.
//                    [--baseline <report.json>] [--no-write]
//
// --version builds an older prompt version through the same handler (default PROMPT_VERSION),
// so a live run can compare versions on the same day and model.
//
// which is:
//   deno run --no-lock --config supabase/functions/deno.json --allow-env --allow-read
//     --allow-write=evals/reports --allow-net scripts/run-evals.ts --prompt reply
//
// Live providers read the same variables as the Edge Function secrets from this shell
// (ANTHROPIC_API_KEY [+ ANTHROPIC_MODEL], AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY +
// BEDROCK_REGION + BEDROCK_MODEL_ID, MISTRAL_API_KEY + MISTRAL_MODEL) and are checked by the
// function's own config code with staging rules (Bedrock EU-only, unsafe SDK env refused).
// Inputs are synthetic eval cases only. Exit code 1 when any case fails (safety: must be 100%).
import { parseArgs } from 'node:util';
import {
  buildPrompt,
  isPromptVersion,
  PROMPT_VERSION,
  PROMPT_VERSIONS,
} from '../supabase/functions/_shared/prompts/index.ts';
import { redact } from '../supabase/functions/_shared/redact.ts';
import { validateChips } from '../supabase/functions/_shared/chips.ts';
import { EVAL_SETS, type EvalCase, type EvalSet, parseCases } from '../evals/lib/cases.ts';
import { FAKE_SCENARIOS, type FakeScenario } from '../supabase/functions/_shared/llm/fake.ts';
import { formatTrace } from '../evals/lib/trace.ts';
import { evaluate, type CaseResult } from '../evals/lib/evaluate.ts';
import { EVAL_PROVIDERS, type EvalProvider, Harness, makeProviders } from '../evals/lib/harness.ts';
import { prettyJson, renderReport, type Summary, summarise } from '../evals/lib/report.ts';

const root = new URL('..', import.meta.url);
const { values: args } = parseArgs({
  args: Deno.args,
  options: {
    prompt: { type: 'string' },
    provider: { type: 'string', default: 'fake' },
    version: { type: 'string', default: PROMPT_VERSION },
    case: { type: 'string' },
    lang: { type: 'string' },
    baseline: { type: 'string' },
    'no-write': { type: 'boolean', default: false },
    trace: { type: 'boolean', default: false },
    'fake-scenario': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (args.help || !args.prompt) {
  console.log(
    `Usage: npm run evals -- --prompt ${EVAL_SETS.join('|')} [--provider ${EVAL_PROVIDERS.join('|')}] [--version ${PROMPT_VERSIONS.join('|')}] [--case id] [--lang de] [--baseline evals/reports/….json] [--no-write]`,
  );
  Deno.exit(args.help ? 0 : 2);
}
if (!(EVAL_SETS as readonly string[]).includes(args.prompt)) {
  console.error(`--prompt must be one of ${EVAL_SETS.join(', ')}`);
  Deno.exit(2);
}
if (!(EVAL_PROVIDERS as readonly string[]).includes(args.provider)) {
  console.error(`--provider must be one of ${EVAL_PROVIDERS.join(', ')}`);
  Deno.exit(2);
}
if (!isPromptVersion(args.version)) {
  console.error(`--version must be one of ${PROMPT_VERSIONS.join(', ')}`);
  Deno.exit(2);
}
const version = args.version;
const set = args.prompt as EvalSet;
const provider = args.provider as EvalProvider;

const file = new URL(`evals/${set}/cases.jsonl`, root);
let cases: EvalCase[] = parseCases(await Deno.readTextFile(file), `evals/${set}/cases.jsonl`);
if (args.case) cases = cases.filter((c) => c.id === args.case);
if (args.lang) cases = cases.filter((c) => c.expect.lang === args.lang);
if (cases.length === 0) {
  console.error('No cases selected.');
  Deno.exit(2);
}

const providers = await makeProviders(provider, (name) => Deno.env.get(name)).catch((err) => {
  console.error(
    `${(err as Error).message}. Set the provider's keys in this shell (see the header comment).`,
  );
  Deno.exit(2);
});
const fakeScenario = args['fake-scenario'];
if (fakeScenario !== undefined && !(FAKE_SCENARIOS as readonly string[]).includes(fakeScenario)) {
  console.error(`--fake-scenario must be one of ${FAKE_SCENARIOS.join(', ')}`);
  Deno.exit(2);
}
const harness = new Harness(
  providers,
  provider,
  version,
  fakeScenario ? { fakeScenario: fakeScenario as FakeScenario } : {},
);

// System prompt size for these cases (the same assembly the function uses).
const sizes = cases.map((c) => {
  const chips = validateChips(c.chips);
  return buildPrompt(
    {
      kind: c.kind,
      text: redact(c.text).text,
      langHint: c.lang,
      uiLang: c.chips.uiLang,
      relationship: c.chips.relationship,
      closeness: c.chips.closeness,
      tone: chips.tone,
      flirt: chips.flirt,
      formality: c.chips.formality,
      iAm: c.chips.iAm,
      theyAre: c.chips.theyAre,
    },
    undefined,
    version,
  ).system.length;
});

console.log(
  `Running ${cases.length} ${set} cases with ${provider} (${providers[0]!.model}), prompt ${version}…`,
);
const results: CaseResult[] = [];
for (const c of cases) {
  const run = await harness.run(c);
  const result = evaluate(c, run, { fake: provider === 'fake' });
  if (args.trace) for (const t of run.traces) console.log(`trace ${c.id} ${formatTrace(t)}`);
  results.push(result);
  const failed = result.checks.filter((x) => x.status === 'fail');
  console.log(
    `${result.pass ? 'pass' : 'FAIL'}  ${c.id.padEnd(28)} ${c.expect.lang}  ${run.msFirstCard === null ? '   -  ' : `${Math.round(run.msFirstCard)}ms`.padStart(6)}  ${failed.map((x) => `${x.check}: ${x.detail}`).join(' | ')}`,
  );
}

const date = new Date().toISOString().slice(0, 10);
const minChars = Math.min(...sizes);
const maxChars = Math.max(...sizes);
const summary = summarise(
  {
    date,
    set,
    promptVersion: version,
    provider,
    model: providers[0]!.model,
    systemPrompt: {
      minChars,
      maxChars,
      estTokensMin: Math.round(minChars / 3.6),
      estTokensMax: Math.round(maxChars / 3.6),
    },
  },
  results,
);
const baseline: Summary | null = args.baseline
  ? (JSON.parse(await Deno.readTextFile(args.baseline)) as Summary)
  : null;
const markdown = renderReport(summary, results, baseline);

const partial = Boolean(args.case || args.lang);
if (!args['no-write'] && !partial) {
  const base = `evals/reports/${date}-${set}-${version}-${provider}`;
  await Deno.mkdir(new URL('evals/reports/', root), { recursive: true });
  await Deno.writeTextFile(new URL(`${base}.md`, root), markdown);
  await Deno.writeTextFile(new URL(`${base}.json`, root), `${prettyJson(summary)}\n`);
  console.log(`\nReport: ${base}.md`);
} else if (partial) {
  console.log('\n(--case/--lang: partial run, no report written)');
}

const perLang = Object.entries(summary.perLang)
  .map(([lang, v]) => `${lang} ${v.passed}/${v.cases}`)
  .join(' · ');
console.log(`Passed ${summary.total.passed}/${summary.total.cases} (${perLang})`);
if (provider === 'fake') {
  console.log(
    `Plumbing checks: ${summary.plumbing.passed}/${summary.plumbing.cases}. Fake provider: plumbing and deterministic checks only, not reply quality.`,
  );
}
Deno.exit(summary.total.passed === summary.total.cases ? 0 : 1);
