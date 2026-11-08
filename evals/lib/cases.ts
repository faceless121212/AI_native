// Eval case format (prompt-engineer agent, "Evals"):
//   {id, kind, lang, text, chips, expect: {lang, formality, maxChars, mustNot:[...], crisis?, refused?}}
// `lang` is the language hint the keyboard would send (en|de|fr|es|it|other). `fake` picks the
// fake provider's scenario for --provider fake only (ignored by real models). Cases are synthetic:
// never paste real user messages into these files.
import { z } from 'zod';
import { FAKE_SCENARIOS } from '../../supabase/functions/_shared/llm/fake.ts';
import { redact } from '../../supabase/functions/_shared/redact.ts';
import {
  cardMaxChars,
  Closeness,
  FlirtLevel,
  Formality,
  Gender,
  Lang,
  LangHint,
  POLISH_CARD_TEXT_MAX_CHARS,
  Relationship,
  ReplyKind,
  Tone,
} from '../../supabase/functions/_shared/schemas.ts';

export const EVAL_SETS = ['reply', 'polish', 'safety'] as const;
export type EvalSet = (typeof EVAL_SETS)[number];

export const EvalCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  kind: ReplyKind,
  lang: LangHint,
  text: z.string().min(1).max(1000),
  chips: z.strictObject({
    relationship: Relationship,
    closeness: Closeness,
    tone: Tone,
    flirt: FlirtLevel.default('off'),
    formality: Formality,
    iAm: Gender.default('unspecified'),
    theyAre: Gender.default('unspecified'),
    uiLang: Lang.default('en'),
  }),
  /** What the case is about, for the report (e.g. formality-pair, injection, crisis). */
  tags: z.array(z.string()).default([]),
  fake: z.enum(FAKE_SCENARIOS).optional(),
  expect: z.strictObject({
    /** Language every card must be in. */
    lang: Lang,
    /** Register the cards must use (polish: checked on the rewrite only). null = not checked. */
    formality: Formality.nullable(),
    /**
     * The text speaks to a group: the address must stay plural, and French casual plural "vous"
     * is not formal (checks.ts formalityViolations).
     */
    plural: z.boolean().default(false),
    /**
     * Longest card allowed. At most what the server keeps (cardMaxChars: 300 for replies; for
     * Polish 30% more than the redacted draft, at least 300; checked in parseCases).
     */
    maxChars: z.number().int().min(20).max(POLISH_CARD_TEXT_MAX_CHARS),
    /** Extra phrases no card may contain (accent- and case-insensitive, word boundaries). */
    mustNot: z.array(z.string()).default([]),
    /** Default false: a crisis card on an ordinary message is a failure too. */
    crisis: z.boolean().default(false),
    /**
     * Default false: an unneeded refusal is a failure too. "any": both a refusal and safe replies
     * pass (prompt-injection cases in the safety set, where refusing is also a safe outcome).
     */
    refused: z.union([z.boolean(), z.literal('any')]).default(false),
    /** META.lang, when it matters (e.g. "other" for a Portuguese message). */
    metaLang: LangHint.optional(),
  }),
});
export type EvalCase = z.infer<typeof EvalCaseSchema>;

export function parseCases(jsonl: string, file: string): EvalCase[] {
  const cases: EvalCase[] = [];
  const ids = new Set<string>();
  jsonl.split('\n').forEach((line, i) => {
    if (line.trim() === '') return;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      throw new Error(`${file}:${i + 1}: not JSON`);
    }
    const parsed = EvalCaseSchema.safeParse(json);
    if (!parsed.success) {
      throw new Error(
        `${file}:${i + 1}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`,
      );
    }
    const limit = cardMaxChars(parsed.data.kind, Array.from(redact(parsed.data.text).text).length);
    if (parsed.data.expect.maxChars > limit)
      throw new Error(
        `${file}:${i + 1}: maxChars ${parsed.data.expect.maxChars} > ${limit}, the longest card the server keeps`,
      );
    if (ids.has(parsed.data.id))
      throw new Error(`${file}:${i + 1}: duplicate id ${parsed.data.id}`);
    ids.add(parsed.data.id);
    cases.push(parsed.data);
  });
  return cases;
}
