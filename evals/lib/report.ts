// Markdown report + JSON summary for evals/reports/. Reports contain only synthetic eval inputs
// and the outputs for them, never user data.
import { EVAL_LANGS } from './checks.ts';
import { CHECKS, type CaseResult, type CheckName } from './evaluate.ts';
import type { EvalProvider } from './harness.ts';

export interface ReportMeta {
  date: string;
  set: string;
  promptVersion: string;
  provider: EvalProvider;
  model: string;
  systemPrompt: { minChars: number; maxChars: number; estTokensMin: number; estTokensMax: number };
}

export interface Summary {
  meta: ReportMeta;
  total: { cases: number; passed: number };
  perLang: Record<string, { cases: number; passed: number; plumbingPassed: number }>;
  /** Cases whose plumbing checks (PLUMBING_CHECKS) all pass: the useful number for fake runs. */
  plumbing: { cases: number; passed: number };
  perCheck: Record<string, { applicable: number; passed: number }>;
  latency: {
    firstCardP50: number | null;
    firstCardP95: number | null;
    totalP50: number;
    totalP95: number;
  };
  cost: {
    meanMicroEurPerReply: number;
    totalMicroEur: number;
    meanTokensIn: number;
    meanTokensOut: number;
  };
  failures: { id: string; checks: string[] }[];
}

/**
 * What each check means with the fake provider (canned lines chosen by language and formality):
 * true = it tests real code (pipeline, crisis keyword lists, checkers); false = it can only
 * confirm plumbing, not model quality.
 */
export const MEANINGFUL_WITH_FAKE: Record<CheckName, string> = {
  refused: 'plumbing only (scenario "refused" forced by the case)',
  crisis:
    'yes for crisis cases: scenario "crisis-nometa" leaves the flag to the crisis.ts keyword backstop',
  cards: 'plumbing only (parser, post-check, META-first order)',
  length: 'no (canned lines)',
  lang: 'plumbing only: fake answers in the hinted language; wrong-hint cases (lang-<xx> scenario) check that cards in the message language survive the post-check via META.lang',
  formality: 'no (canned lines per formality); checker itself is unit-tested',
  banned: 'no (canned lines); lists are unit-tested',
  explicit: 'no (canned lines); lists are unit-tested',
  emoji: 'no (canned lines)',
  punctuation: 'no (canned lines)',
  format: 'no (canned lines)',
  distinct: 'no (canned lines)',
  placeholders:
    'skipped with the fake (canned lines cannot keep placeholders); real check for live providers',
  refund: 'yes (real pipeline + in-memory quota)',
  privacy:
    'yes, within scope: the in-memory store and all console output during the request contain no input (original or redacted) or card text; crisis only as an anonymous count. Does not cover Postgres, Sentry or PostHog',
};

/** Checks that test real code with the fake provider (see MEANINGFUL_WITH_FAKE). */
export const PLUMBING_CHECKS: readonly CheckName[] = [
  'refused',
  'crisis',
  'cards',
  'lang',
  'refund',
  'privacy',
];

function plumbingPass(r: CaseResult): boolean {
  return r.checks.every((x) => x.status !== 'fail' || !PLUMBING_CHECKS.includes(x.check));
}

function pct(passed: number, total: number): string {
  return total === 0 ? 'n/a' : `${((passed / total) * 100).toFixed(1)}% (${passed}/${total})`;
}

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

export function summarise(meta: ReportMeta, results: CaseResult[]): Summary {
  const perLang: Summary['perLang'] = {};
  for (const lang of EVAL_LANGS) {
    const rs = results.filter((r) => r.lang === lang);
    if (rs.length) {
      perLang[lang] = {
        cases: rs.length,
        passed: rs.filter((r) => r.pass).length,
        plumbingPassed: rs.filter(plumbingPass).length,
      };
    }
  }
  const perCheck: Summary['perCheck'] = {};
  for (const check of CHECKS) {
    const applicable = results.flatMap((r) =>
      r.checks.filter((x) => x.check === check && x.status !== 'skip'),
    );
    perCheck[check] = {
      applicable: applicable.length,
      passed: applicable.filter((x) => x.status === 'pass').length,
    };
  }
  const first = results.map((r) => r.run.msFirstCard).filter((x): x is number => x !== null);
  const total = results.map((r) => r.run.msTotal);
  const charged = results.filter((r) => r.run.tokensIn > 0);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    meta,
    total: { cases: results.length, passed: results.filter((r) => r.pass).length },
    plumbing: { cases: results.length, passed: results.filter(plumbingPass).length },
    perLang,
    perCheck,
    latency: {
      firstCardP50: quantile(first, 0.5),
      firstCardP95: quantile(first, 0.95),
      totalP50: quantile(total, 0.5) ?? 0,
      totalP95: quantile(total, 0.95) ?? 0,
    },
    cost: {
      meanMicroEurPerReply: charged.length
        ? sum(charged.map((r) => r.run.costMicroEur)) / charged.length
        : 0,
      totalMicroEur: sum(results.map((r) => r.run.costMicroEur)),
      meanTokensIn: charged.length ? sum(charged.map((r) => r.run.tokensIn)) / charged.length : 0,
      meanTokensOut: charged.length ? sum(charged.map((r) => r.run.tokensOut)) / charged.length : 0,
    },
    failures: results
      .filter((r) => !r.pass)
      .map((r) => ({
        id: r.id,
        checks: r.checks.filter((x) => x.status === 'fail').map((x) => x.check),
      })),
  };
}

const ms = (v: number | null) => (v === null ? 'n/a' : `${Math.round(v)} ms`);

export function renderReport(
  summary: Summary,
  results: CaseResult[],
  baseline: Summary | null,
): string {
  const { meta } = summary;
  const fake = meta.provider === 'fake';
  const out: string[] = [];
  out.push(`# Eval report: ${meta.set} · prompt ${meta.promptVersion} · ${meta.provider}`);
  out.push('');
  out.push(`- Date: ${meta.date}`);
  out.push(`- Provider / model: ${meta.provider} / ${meta.model}`);
  out.push(
    `- Cases: ${summary.total.cases}, passed: ${pct(summary.total.passed, summary.total.cases)}`,
  );
  if (fake)
    out.push(
      `- Passed on plumbing checks: ${pct(summary.plumbing.passed, summary.plumbing.cases)}`,
    );
  out.push(
    `- System prompt: ${meta.systemPrompt.minChars}–${meta.systemPrompt.maxChars} chars, about ${meta.systemPrompt.estTokensMin}–${meta.systemPrompt.estTokensMax} tokens (estimate, chars/3.6)`,
  );
  out.push('- Run: in-process reply handler + pipeline, in-memory store (scripts/run-evals.ts)');
  if (fake) {
    out.push('');
    out.push(
      '> **Fake provider: this report does not measure reply quality.** The fake returns canned lines per language and formality. It verifies the runner, the pipeline (META-first parsing, post-check, refusal refund, no message or card text in the in-memory store or console output) and, for crisis cases, the deterministic keyword backstop in `_shared/crisis.ts`. Quality numbers need `--provider anthropic|bedrock|mistral`.',
    );
  }
  out.push('');
  out.push('## Pass rate per language');
  out.push('');
  const plumbingCol = fake ? ' Plumbing checks only |' : '';
  out.push(
    baseline
      ? `| Language | Before | After |${plumbingCol}`
      : `| Language | All checks |${plumbingCol}`,
  );
  out.push(baseline ? `|---|---|---|${fake ? '---|' : ''}` : `|---|---|${fake ? '---|' : ''}`);
  for (const lang of EVAL_LANGS) {
    const now = summary.perLang[lang];
    if (!now) continue;
    const before = baseline?.perLang[lang];
    const plumbing = fake ? ` ${pct(now.plumbingPassed, now.cases)} |` : '';
    out.push(
      baseline
        ? `| ${lang} | ${before ? pct(before.passed, before.cases) : 'n/a'} | ${pct(now.passed, now.cases)} |${plumbing}`
        : `| ${lang} | ${pct(now.passed, now.cases)} |${plumbing}`,
    );
  }
  if (fake) {
    out.push('');
    out.push(
      `Plumbing checks (${PLUMBING_CHECKS.join(', ')}) test real code with the fake; the other checks run on canned lines; those a canned line can't satisfy (polish placeholders, META.lang outside lang-<xx> scenarios) are skipped.`,
    );
  }
  out.push('');
  out.push('## Pass rate per check');
  out.push('');
  out.push(
    fake ? '| Check | Pass rate | Meaningful with the fake provider? |' : '| Check | Pass rate |',
  );
  out.push(fake ? '|---|---|---|' : '|---|---|');
  for (const check of CHECKS) {
    const c = summary.perCheck[check]!;
    out.push(
      fake
        ? `| ${check} | ${pct(c.passed, c.applicable)} | ${MEANINGFUL_WITH_FAKE[check]} |`
        : `| ${check} | ${pct(c.passed, c.applicable)} |`,
    );
  }
  out.push('');
  out.push('## Latency and cost');
  out.push('');
  out.push(
    `- First card: p50 ${ms(summary.latency.firstCardP50)}, p95 ${ms(summary.latency.firstCardP95)}`,
  );
  out.push(
    `- Whole stream: p50 ${ms(summary.latency.totalP50)}, p95 ${ms(summary.latency.totalP95)}`,
  );
  out.push(
    `- Tokens per request: ${Math.round(summary.cost.meanTokensIn)} in, ${Math.round(summary.cost.meanTokensOut)} out (mean)`,
  );
  out.push(
    `- Cost per reply: ${(summary.cost.meanMicroEurPerReply / 1e6).toFixed(6)} EUR mean; run total ${(summary.cost.totalMicroEur / 1e6).toFixed(4)} EUR (prices in _shared/cost.ts; check them)`,
  );
  if (fake)
    out.push(
      '- Fake provider: latency is in-process only and cost is 0; neither says anything about a real model.',
    );
  out.push('');
  out.push('## Cases');
  out.push('');
  out.push('| Case | Lang | Tags | Result | Failed checks | ms first card |');
  out.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const failed = r.checks
      .filter((x) => x.status === 'fail')
      .map((x) => x.check)
      .join(', ');
    out.push(
      `| ${r.id} | ${r.lang} | ${r.tags.join(', ')} | ${r.pass ? 'pass' : '**fail**'} | ${failed} | ${ms(r.run.msFirstCard)} |`,
    );
  }
  const failures = results.filter((r) => !r.pass);
  if (failures.length) {
    out.push('');
    out.push('## Failures');
    for (const r of failures) {
      out.push('');
      out.push(`### ${r.id}`);
      for (const x of r.checks.filter((c) => c.status === 'fail'))
        out.push(`- ${x.check}: ${x.detail ?? ''}`);
      out.push(
        `- META: ${JSON.stringify(r.run.meta)}; status ${r.run.status}; error ${r.run.errorCode ?? 'none'}`,
      );
      for (const card of r.run.cards)
        out.push(`- ${card.variant} ${card.index + 1}: ${card.text.replace(/\|/g, '\\|')}`);
    }
  }
  out.push('');
  return out.join('\n');
}

/**
 * JSON in the style `prettier --check` expects (CI runs it on the whole repo): objects expanded,
 * arrays of primitives on one line when they fit in 100 columns.
 */
export function prettyJson(value: unknown, indent = 0, key = ''): string {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.every((v) => v === null || typeof v !== 'object')) {
      const inline = `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
      if (indent + key.length + inline.length + 4 <= 100) return inline;
    }
    const items = value.map((v) => `${pad}  ${prettyJson(v, indent + 2)}`);
    return `[\n${items.join(',\n')}\n${pad}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const items = entries.map(
      ([k, v]) => `${pad}  ${JSON.stringify(k)}: ${prettyJson(v, indent + 2, JSON.stringify(k))}`,
    );
    return `{\n${items.join(',\n')}\n${pad}}`;
  }
  return JSON.stringify(value);
}
