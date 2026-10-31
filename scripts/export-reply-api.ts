// supabase/functions/_shared/schemas.ts (zod) → docs/reply-api.json (JSON Schema 2020-12), the
// contract the Swift (ReplyAPI.swift) and Kotlin (ReplyApi.kt) mirrors are tested against.
//   node scripts/export-reply-api.ts           write the file
//   node scripts/export-reply-api.ts --check   exit 1 if the file is missing or stale
import fs from 'node:fs';
import path from 'node:path';
import prettier from 'prettier';
import { z } from 'zod';
import * as api from '../supabase/functions/_shared/schemas.ts';
import { repoRoot } from './lib/repo-root.ts';

const OUTPUT = 'docs/reply-api.json';

type Io = 'input' | 'output';

function schema(s: z.ZodType, io: Io): unknown {
  const { $schema: _dropped, ...rest } = z.toJSONSchema(s, { target: 'draft-2020-12', io });
  return rest;
}

const document = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $comment:
    'Generated from supabase/functions/_shared/schemas.ts by scripts/export-reply-api.ts. Do not edit by hand.',
  title: 'Replywise Edge Function API',
  constants: {
    REPLY_TEXT_MAX_CHARS: api.REPLY_TEXT_MAX_CHARS,
    CARD_TEXT_MAX_CHARS: api.CARD_TEXT_MAX_CHARS,
    SSE_EVENT_NAMES: [...api.SSE_EVENT_NAMES],
  },
  requests: {
    ReplyRequest: schema(api.ReplyRequest, 'input'),
    ReplyFeedbackRequest: schema(api.ReplyFeedbackRequest, 'input'),
    ConsentRequest: schema(api.ConsentRequest, 'input'),
    ProfilePatchRequest: schema(api.ProfilePatchRequest, 'input'),
    DeviceKeyCreateRequest: schema(api.DeviceKeyCreateRequest, 'input'),
    DeviceKeyRevokeRequest: schema(api.DeviceKeyRevokeRequest, 'input'),
  },
  responses: {
    ErrorResponse: schema(api.ErrorResponse, 'output'),
    ConsentResponse: schema(api.ConsentResponse, 'output'),
    ProfileResponse: schema(api.ProfileResponse, 'output'),
    DeviceKeyCreateResponse: schema(api.DeviceKeyCreateResponse, 'output'),
    DeviceKeyRevokeResponse: schema(api.DeviceKeyRevokeResponse, 'output'),
    QuotaResponse: schema(api.QuotaResponse, 'output'),
  },
  sseEvents: Object.fromEntries(
    api.SSE_EVENT_NAMES.map((name) => [name, schema(api.SseEventPayloads[name], 'output')]),
  ),
};

const target = path.join(repoRoot, OUTPUT);
const options = (await prettier.resolveConfig(target)) ?? {};
const contents = await prettier.format(JSON.stringify(document), { ...options, parser: 'json' });
const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;

if (process.argv.includes('--check')) {
  if (current !== contents) {
    console.error(`${OUTPUT} is stale. Run: node scripts/export-reply-api.ts`);
    process.exit(1);
  }
  console.log(`${OUTPUT} is up to date.`);
} else if (current === contents) {
  console.log(`${OUTPUT} already up to date.`);
} else {
  fs.writeFileSync(target, contents);
  console.log(`Updated ${OUTPUT}`);
}
