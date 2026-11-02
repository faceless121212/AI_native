import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  CardEvent,
  ConsentRequest,
  ConsentResponse,
  DeviceKeyCreateRequest,
  DeviceKeyRevokeRequest,
  DoneEvent,
  ErrorEvent,
  ErrorResponse,
  MetaEvent,
  ProfilePatchRequest,
  QuotaEvent,
  ReplyFeedbackRequest,
  ReplyRequest,
  SSE_EVENT_NAMES,
  SseEventPayloads,
} from './schemas.ts';

const ok = (s: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  assert(s.safeParse(v).success, JSON.stringify(v));
const bad = (s: { safeParse(v: unknown): { success: boolean } }, v: unknown) =>
  assert(!s.safeParse(v).success, JSON.stringify(v));

const reply = {
  kind: 'reply',
  text: 'Hey, wie war dein Wochenende? 😊',
  langHint: 'de',
  relationship: 'friend',
  closeness: 3,
  tone: 'warm',
  flirt: 'off',
  formality: 'casual',
  iAm: 'woman',
  theyAre: 'unspecified',
  uiLang: 'de',
  source: 'keyboard',
  clientRequestId: '6f1c1f5e-3d7a-4a51-9a59-1f0c2b8a9e10',
};

Deno.test('ReplyRequest: valid request', () => ok(ReplyRequest, reply));

Deno.test('ReplyRequest: text limits in code points (emoji count as one)', () => {
  ok(ReplyRequest, { ...reply, text: '😊'.repeat(1000) });
  ok(ReplyRequest, { ...reply, text: 'a'.repeat(1000) });
  bad(ReplyRequest, { ...reply, text: 'a'.repeat(1001) });
  bad(ReplyRequest, { ...reply, text: '😊'.repeat(1001) });
  bad(ReplyRequest, { ...reply, text: '' });
  bad(ReplyRequest, { ...reply, text: '   \n ' });
});

Deno.test('ReplyRequest: chip values come from the fixed lists', () => {
  ok(ReplyRequest, {
    ...reply,
    kind: 'polish',
    tone: 'sayNoKindly',
    relationship: 'colleague',
    formality: 'formal',
  });
  ok(ReplyRequest, { ...reply, langHint: 'other', source: 'app' });
  bad(ReplyRequest, { ...reply, tone: 'sarcastic' });
  bad(ReplyRequest, { ...reply, flirt: 'explicit' });
  bad(ReplyRequest, { ...reply, closeness: 0 });
  bad(ReplyRequest, { ...reply, closeness: 6 });
  bad(ReplyRequest, { ...reply, closeness: 2.5 });
  bad(ReplyRequest, { ...reply, uiLang: 'pt' });
  bad(ReplyRequest, { ...reply, clientRequestId: 'abc' });
  const { tone: _tone, ...missing } = reply;
  bad(ReplyRequest, missing);
});

Deno.test('client requests are strict: unknown keys are rejected everywhere', () => {
  bad(ReplyRequest, { ...reply, extra: true });
  bad(ReplyFeedbackRequest, {
    requestId: '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b',
    cardIndex: 0,
    type: 'up',
    text: 'hi',
  });
  bad(ConsentRequest, { action: 'grant', policyVersion: '2026-11-01', grantedAt: 'now' });
  bad(ConsentRequest, { action: 'withdraw', all: true });
  bad(ProfilePatchRequest, { uiLang: 'de', admin: true });
  bad(DeviceKeyCreateRequest, { platform: 'ios', userId: 'x' });
  bad(DeviceKeyRevokeRequest, { scope: 'all', userId: 'x' });
});

Deno.test('SSE payloads', () => {
  assertEquals([...SSE_EVENT_NAMES], Object.keys(SseEventPayloads));
  const requestId = '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b';
  ok(CardEvent, { index: 0, variant: 'reply', text: 'Super, danke! Und deins?' });
  ok(CardEvent, { index: 1, variant: 'rewrite', text: 'x' });
  bad(CardEvent, { index: 3, variant: 'reply', text: 'x' });
  bad(CardEvent, { index: 0, variant: 'reply', text: '' });
  ok(MetaEvent, { requestId, lang: 'de', crisis: false, refused: false });
  bad(MetaEvent, { requestId, lang: 'de', crisis: 'no', refused: false });
  ok(QuotaEvent, {
    plan: 'free',
    leftToday: 2,
    resetAt: '2026-11-01T00:00:00+01:00',
    fairUseLeft: null,
  });
  ok(QuotaEvent, {
    plan: 'lifetime',
    leftToday: null,
    resetAt: '2026-11-01T00:00:00Z',
    fairUseLeft: 99,
  });
  bad(QuotaEvent, {
    plan: 'free',
    leftToday: -1,
    resetAt: '2026-11-01T00:00:00Z',
    fairUseLeft: null,
  });
  bad(QuotaEvent, {
    plan: 'gold',
    leftToday: 1,
    resetAt: '2026-11-01T00:00:00Z',
    fairUseLeft: null,
  });
  ok(DoneEvent, { requestId, cards: 3 });
  ok(ErrorEvent, { error: 'provider_down', message: 'AI replies are having trouble.' });
  bad(ErrorEvent, { error: 'teapot', message: '' });
});

Deno.test('ReplyFeedbackRequest', () => {
  ok(ReplyFeedbackRequest, {
    requestId: '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b',
    cardIndex: 2,
    type: 'inserted',
  });
  bad(ReplyFeedbackRequest, {
    requestId: '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b',
    cardIndex: 2,
    type: 'love',
  });
});

Deno.test('ConsentRequest / ConsentResponse', () => {
  ok(ConsentRequest, { action: 'grant', policyVersion: '2026-10-v1' });
  ok(ConsentRequest, { action: 'withdraw' });
  bad(ConsentRequest, { action: 'grant' });
  bad(ConsentRequest, { action: 'grant', policyVersion: 'has spaces' });
  bad(ConsentRequest, { action: 'grant', policyVersion: 'x'.repeat(33) });
  bad(ConsentRequest, { action: 'maybe' });
  ok(ConsentResponse, {
    action: 'grant',
    aiEnabled: true,
    policyVersion: 'v1',
    grantedAt: '2026-10-31T21:00:00.000Z',
  });
  ok(ConsentResponse, {
    action: 'withdraw',
    aiEnabled: false,
    withdrawnAt: '2026-10-31T21:00:00.000Z',
    revokedDeviceKeys: 2,
  });
  bad(ConsentResponse, {
    action: 'withdraw',
    aiEnabled: true,
    withdrawnAt: '2026-10-31T21:00:00.000Z',
    revokedDeviceKeys: 0,
  });
});

Deno.test('ProfilePatchRequest: strict, at least one field, client never sends a timestamp', () => {
  ok(ProfilePatchRequest, { ageConfirmed: true });
  ok(ProfilePatchRequest, { uiLang: 'it', timezone: 'Europe/Rome' });
  bad(ProfilePatchRequest, { iAm: 'man' });
  bad(ProfilePatchRequest, { theyAre: 'woman' });
  ok(ProfilePatchRequest, { timezone: 'America/Argentina/Buenos_Aires' });
  ok(ProfilePatchRequest, { timezone: 'Etc/GMT+1' });
  bad(ProfilePatchRequest, {});
  bad(ProfilePatchRequest, { ageConfirmed: false });
  bad(ProfilePatchRequest, { ageConfirmedAt: '2020-01-01T00:00:00Z' });
  bad(ProfilePatchRequest, { ageConfirmed: true, extra: 1 });
  bad(ProfilePatchRequest, { uiLang: 'en-GB' });
  bad(ProfilePatchRequest, { timezone: '../../etc/passwd' });
});

Deno.test('Device key requests', () => {
  ok(DeviceKeyCreateRequest, { platform: 'ios' });
  ok(DeviceKeyCreateRequest, { platform: 'android' });
  bad(DeviceKeyCreateRequest, { platform: 'web' });
  ok(DeviceKeyRevokeRequest, { scope: 'all' });
  ok(DeviceKeyRevokeRequest, { scope: 'key', keyId: '0b7f1e4c-2d0a-4c3e-8f5b-6a7d8e9f0a1b' });
  bad(DeviceKeyRevokeRequest, { scope: 'key' });
  bad(DeviceKeyRevokeRequest, {});
});

Deno.test('ErrorResponse', () => {
  ok(ErrorResponse, { error: 'unauthorized', message: 'x' });
  bad(ErrorResponse, { error: 'unauthorized' });
});

Deno.test(
  'cardMaxChars: replies stay at 300, Polish scales with the draft within 300..1300',
  async () => {
    const { cardMaxChars, CARD_TEXT_MAX_CHARS, POLISH_CARD_TEXT_MAX_CHARS } =
      await import('./schemas.ts');
    const { assertEquals } = await import('jsr:@std/assert@1');
    assertEquals(cardMaxChars('reply', 900), CARD_TEXT_MAX_CHARS);
    assertEquals(cardMaxChars('polish', 50), CARD_TEXT_MAX_CHARS);
    assertEquals(cardMaxChars('polish', 420), 546);
    assertEquals(cardMaxChars('polish', 1000), POLISH_CARD_TEXT_MAX_CHARS);
  },
);
