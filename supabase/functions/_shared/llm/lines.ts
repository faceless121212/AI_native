// Parses the model output format (architecture §7 step 8) as it streams:
//   reply:  R1|text  R2|text  R3|text      polish:  L|text  W|text
//   META|{"lang":"de","crisis":false,"refused":false}
// One item per line. Text arrives in arbitrary chunks, so lines are buffered until their newline.
// Lines in any order are accepted (META may come first). Anything else is reported as invalid
// (never with its content).
import { z } from 'zod';
import { LangHint, type ReplyKind } from '../schemas.ts';

export type CardTag = 'R1' | 'R2' | 'R3' | 'L' | 'W';

export const ModelMeta = z
  .object({
    lang: LangHint.optional(),
    crisis: z.boolean().default(false),
    refused: z.boolean().default(false),
  })
  .loose();
export type ModelMeta = z.infer<typeof ModelMeta>;

export type InvalidReason = 'untagged' | 'wrong_kind' | 'bad_meta' | 'empty' | 'too_long_line';

export type ParsedItem =
  | { type: 'card'; tag: CardTag; text: string }
  | { type: 'meta'; meta: ModelMeta }
  | { type: 'invalid'; reason: InvalidReason };

/** Longest line we buffer; a model that never sends a newline can't grow memory without bound. */
const MAX_LINE_CHARS = 4000;

const LINE = /^\s*(R[1-3]|L|W|META)\s*\|\s?(.*)$/s;
const TAGS: Record<ReplyKind, readonly CardTag[]> = {
  reply: ['R1', 'R2', 'R3'],
  polish: ['L', 'W'],
};

export function parseLine(line: string, kind: ReplyKind): ParsedItem | null {
  if (line.trim() === '') return null;
  const match = LINE.exec(line);
  if (!match) return { type: 'invalid', reason: 'untagged' };
  const tag = match[1] as CardTag | 'META';
  const rest = (match[2] ?? '').trim();
  if (tag === 'META') {
    let json: unknown;
    try {
      json = JSON.parse(rest);
    } catch {
      return { type: 'invalid', reason: 'bad_meta' };
    }
    const meta = ModelMeta.safeParse(json);
    return meta.success
      ? { type: 'meta', meta: meta.data }
      : { type: 'invalid', reason: 'bad_meta' };
  }
  if (!TAGS[kind].includes(tag)) return { type: 'invalid', reason: 'wrong_kind' };
  if (rest === '') return { type: 'invalid', reason: 'empty' };
  return { type: 'card', tag, text: rest };
}

export class LineParser {
  private buffer = '';
  private skipping = false;

  constructor(private readonly kind: ReplyKind) {}

  /** Feeds a chunk; returns the items of every line completed by it. */
  push(chunk: string): ParsedItem[] {
    const items: ParsedItem[] = [];
    this.buffer += chunk;
    for (;;) {
      const nl = this.buffer.search(/\r?\n/);
      if (nl === -1) break;
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + (this.buffer[nl] === '\r' ? 2 : 1));
      if (this.skipping) {
        this.skipping = false;
        continue;
      }
      const item = parseLine(line, this.kind);
      if (item) items.push(item);
    }
    if (this.buffer.length > MAX_LINE_CHARS) {
      this.buffer = '';
      if (!this.skipping) items.push({ type: 'invalid', reason: 'too_long_line' });
      this.skipping = true;
    }
    return items;
  }

  /**
   * End of stream. 'complete': the last line may lack its newline and counts. 'truncated' (max
   * tokens, refusal, error): an unfinished last line is dropped.
   */
  end(mode: 'complete' | 'truncated'): ParsedItem[] {
    const rest = this.buffer;
    this.buffer = '';
    if (mode === 'truncated' || this.skipping) return [];
    const item = parseLine(rest.replace(/\r$/, ''), this.kind);
    return item ? [item] : [];
  }
}
