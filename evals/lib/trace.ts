// One line per post-checked card for `run-evals --trace`: attempt, tag, the language it was
// checked against (and whether META had arrived), the message language, the drop or fix reason,
// and the language scores. Codes and numbers only: a CardTrace has no text field.
import type { CardTrace } from '../../supabase/functions/reply/pipeline.ts';

const LANGS = ['en', 'de', 'fr', 'es', 'it'] as const;

function scores(s: CardTrace['scores']): string {
  return LANGS.map((l) => `${l}${s[l]}`).join(',');
}

export function formatTrace(t: CardTrace): string {
  return [
    `a${t.attempt + 1}`,
    t.tag,
    `vs=${t.expected}${t.metaSeen ? '' : '(hint)'}`,
    `msg=${t.messageLang ?? '-'}`,
    `reason=${t.reason ?? 'kept'}`,
    ...(t.fixed ? [`fixed=${t.fixed}`] : []),
    `scores=${scores(t.scores)}`,
    `stop=${scores(t.stopScores)}`,
  ].join(' ');
}
