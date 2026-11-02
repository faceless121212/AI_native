// End-to-end over the local Supabase stack with the fake provider: real GoTrue anonymous sign-in,
// real SQL (consume_reply, refund_reply, record_provider_failure, record_reply_event), the real
// handlers in-process. Includes the parallel test: concurrent consume_reply calls through
// PostgREST (separate connections) can't over-consume. Opt-in (needs `supabase start`):
//   eval "$(supabase status -o env)" && SUPABASE_INTEGRATION=1 SUPABASE_URL=$API_URL \
//     SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY SUPABASE_ANON_KEY=$ANON_KEY \
//     deno test --no-lock --config supabase/functions/deno.json --allow-env --allow-net=127.0.0.1 supabase/functions
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { createServiceClient } from '../_shared/db.ts';
import { withErrors } from '../_shared/http.ts';
import { FakeProvider } from '../_shared/llm/fake.ts';
import { CachedProviderHealth } from '../_shared/llm/health.ts';
import { CURRENT_AI_POLICY_VERSION } from '../_shared/policy.ts';
import { PROMPT_VERSION } from '../_shared/prompts/index.ts';
import { RateLimiter } from '../_shared/rate-limit.ts';
import {
  SupabaseProviderStatusStore,
  SupabaseRepo,
  SupabaseReplyRepo,
  supabaseAuthDeps,
} from '../_shared/repo-supabase.ts';
import type { ConsumeInput } from '../_shared/repo.ts';
import { QuotaResponse } from '../_shared/schemas.ts';
import { bearer, jsonRequest } from '../_shared/testing/helpers.ts';
import { handleQuota } from '../quota/handler.ts';
import { handleReplyRoute, type ReplyDeps } from './handler.ts';
import { FAST_TIMING, names, readEvents, replyRequest } from './testing.ts';

const enabled = Deno.env.get('SUPABASE_INTEGRATION') === '1';
const TEXT = 'Integrationquokka says hi, mail me at quokka.int@example.org';

async function signInReady(db: ReturnType<typeof createServiceClient>) {
  const url = Deno.env.get('SUPABASE_URL')!;
  const res = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')!, 'content-type': 'application/json' },
    body: '{}',
  });
  assert(res.ok, `anonymous sign-up failed: ${res.status}`);
  const body = await res.json();
  const userId: string = body.user.id;
  const repo = new SupabaseRepo(db);
  await repo.patchProfile(userId, { ageConfirmed: true, timezone: 'Europe/Berlin' });
  await repo.grantAiConsent(userId, CURRENT_AI_POLICY_VERSION);
  return { token: body.access_token as string, userId };
}

/** Every test starts from a clean breaker row for the fake provider (no shared state). */
async function resetFakeProvider(db: ReturnType<typeof createServiceClient>) {
  const { error } = await db
    .from('provider_status')
    .update({ down_until: null, failure_count: 0, window_started_at: null, last_error_at: null })
    .eq('provider', 'fake');
  assert(!error, 'reset provider_status');
}

const INPUT: ConsumeInput = {
  kind: 'reply',
  source: 'app',
  tone: 'warm',
  relationship: 'friend',
  closeness: 3,
  formality: 'casual',
  flirt: 'off',
  safetyFlags: [],
};

Deno.test({
  name: 'integration: reply streams, logs metadata only, refunds, feedback, quota',
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = createServiceClient();
    await resetFakeProvider(db);
    const repo = new SupabaseReplyRepo(db);
    const health = new CachedProviderHealth(new SupabaseProviderStatusStore(db));
    const fake = new FakeProvider({ script: ['ok', 'error', 'crisis'] });
    const deps: ReplyDeps = {
      auth: supabaseAuthDeps(db),
      repo,
      llm: { ok: true, providers: [fake] },
      health,
      rateLimiter: new RateLimiter(),
      timing: FAST_TIMING,
    };
    const reply = withErrors('reply', (r) => handleReplyRoute(r, deps));
    const quota = withErrors('quota', (r) => handleQuota(r, { auth: deps.auth, repo }));
    const { token, userId } = await signInReady(db);

    // 1. ok
    let res = await reply(replyRequest(token, { text: TEXT }));
    const okId = res.headers.get('x-request-id')!;
    let events = await readEvents(res);
    assertEquals(names(events), ['card', 'card', 'card', 'meta', 'quota', 'done']);
    assertEquals(events[4]!.data.leftToday, 12);

    // 2. provider error → refund
    res = await reply(replyRequest(token, { text: TEXT }));
    const errId = res.headers.get('x-request-id')!;
    events = await readEvents(res);
    assertEquals(names(events), ['quota', 'error']);
    assertEquals(events[0]!.data.leftToday, 12, 'refunded');

    // 3. crisis: signalled to the client, counted only in the anonymous daily table
    const crisisCount = async () => {
      const { data } = await db
        .from('crisis_daily')
        .select('*')
        .eq('date', new Date().toISOString().slice(0, 10))
        .eq('lang', 'de')
        .eq('source', 'keyboard');
      return { count: Number(data?.[0]?.count ?? 0), columns: Object.keys(data?.[0] ?? {}) };
    };
    const before = await crisisCount();
    res = await reply(replyRequest(token, { text: TEXT }));
    const crisisId = res.headers.get('x-request-id')!;
    events = await readEvents(res);
    assertEquals(events.find((e) => e.event === 'meta')!.data.crisis, true);
    const after = await crisisCount();
    assertEquals(after.count, before.count + 1, 'crisis_daily +1');
    assertEquals(after.columns.sort(), [
      'count',
      'created_at',
      'date',
      'lang',
      'source',
      'updated_at',
    ]);

    const { data: rows } = await db
      .from('ai_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at');
    assertEquals(
      rows!.map((r) => [
        r.id,
        r.status,
        r.charge,
        r.refunded_at !== null,
        r.cards,
        r.delivered_cards,
      ]),
      [
        [okId, 'ok', 'starter', false, 3, [0, 1, 2]],
        [errId, 'error', 'starter', true, 0, []],
        [crisisId, 'ok', 'starter', false, 3, [0, 1, 2]],
      ],
    );
    for (const row of rows!) {
      assertEquals(
        [row.provider, row.model, row.prompt_version],
        ['fake', 'fake-v1', PROMPT_VERSION],
      );
      assert(row.ms_total >= 0 && row.tokens_in > 0);
      assertEquals(row.safety_flags, ['redacted']);
      const all = JSON.stringify(row);
      assert(
        !all.includes('Integrationquokka') && !all.includes('quokka.int'),
        'no text in ai_requests',
      );
    }

    // Feedback on the delivered card; not on the failed request.
    let ev = await reply(
      jsonRequest(
        'POST',
        { requestId: okId, cardIndex: 2, type: 'inserted' },
        bearer(token),
        '/reply/event',
      ),
    );
    assertEquals(await ev.json(), { recorded: true });
    ev = await reply(
      jsonRequest(
        'POST',
        { requestId: errId, cardIndex: 0, type: 'up' },
        bearer(token),
        '/reply/event',
      ),
    );
    assertEquals(ev.status, 404);
    await ev.body?.cancel();

    // quota function agrees with the stream.
    const q = QuotaResponse.parse(
      await (await quota(new Request('http://localhost/quota', { headers: bearer(token) }))).json(),
    );
    assertEquals([q.plan, q.leftToday, q.fairUseLeft], ['free', 11, null]);

    await db.auth.admin.deleteUser(userId);
  },
});

Deno.test({
  name: 'integration: parallel consume_reply calls cannot over-consume (13 allowed: 10 starter + 3 daily)',
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = createServiceClient();
    await resetFakeProvider(db);
    const repo = new SupabaseReplyRepo(db, undefined, 1000);
    const { userId } = await signInReady(db);

    const results = await Promise.all(
      Array.from({ length: 25 }, () => repo.consumeReply(userId, INPUT)),
    );
    const ok = results.filter((r) => r.status === 'ok');
    assertEquals(ok.length, 13);
    assertEquals(results.filter((r) => r.status === 'quota_empty').length, 12);

    const { data: ledger } = await db
      .from('credit_ledger')
      .select('reason, delta')
      .eq('user_id', userId)
      .eq('reason', 'spend');
    assertEquals(ledger!.length, 10);
    const { data: days } = await db.from('usage_days').select('used').eq('user_id', userId);
    assertEquals(days, [{ used: 3 }]);

    // Parallel refunds of the same request refund once.
    const id = ok[0]!.status === 'ok' ? ok[0]!.requestId : '';
    const refunds = await Promise.all(Array.from({ length: 5 }, () => repo.refundReply(id)));
    assertEquals(refunds.filter((r) => r.status === 'ok').length, 1);
    assertEquals((await repo.quotaState(userId))?.leftToday, 1);

    // Rate limit holds under parallel calls too (20 per minute).
    const limited = new SupabaseReplyRepo(db);
    const { userId: paid } = await signInReady(db);
    await db.from('entitlements').insert({ user_id: paid, product: 'annual', active: true });
    const burst = await Promise.all(
      Array.from({ length: 30 }, () => limited.consumeReply(paid, INPUT)),
    );
    assertEquals(burst.filter((r) => r.status === 'ok').length, 20);
    assertEquals(burst.filter((r) => r.status === 'rate').length, 10);

    await db.auth.admin.deleteUser(userId);
    await db.auth.admin.deleteUser(paid);
  },
});

Deno.test({
  name: 'integration: 3 provider failures mark the provider down in provider_status',
  ignore: !enabled,
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const db = createServiceClient();
    const store = new SupabaseProviderStatusStore(db);
    try {
      await resetFakeProvider(db);
      assertEquals(await store.recordFailure('fake'), null);
      assertEquals(await store.recordFailure('fake'), null);
      const until = await store.recordFailure('fake');
      assert(until && until.getTime() > Date.now() + 4 * 60_000);
      assertEquals((await store.readStatus()).get('fake')?.getTime(), until.getTime());
    } finally {
      await resetFakeProvider(db);
    }
  },
});
