import { assertEquals, assertRejects, assertStringIncludes } from 'jsr:@std/assert@1';
import { z } from 'zod';
import { HttpError } from './errors.ts';
import { readJson, withErrors } from './http.ts';
import { captureConsole } from './testing/helpers.ts';

const Schema = z.object({ name: z.string().max(5) });

function post(body: string, type = 'application/json'): Request {
  return new Request('http://localhost/', {
    method: 'POST',
    headers: { 'content-type': type },
    body,
  });
}

Deno.test('readJson: wrong content type → 415', async () => {
  const err = await assertRejects(() => readJson(post('{}', 'text/plain'), Schema), HttpError);
  assertEquals(err.status, 415);
});

Deno.test('readJson: too large → 413', async () => {
  const err = await assertRejects(
    () => readJson(post(JSON.stringify({ name: 'x'.repeat(100) })), Schema, 50),
    HttpError,
  );
  assertEquals(err.status, 413);
});

Deno.test('readJson: invalid JSON → 400 without echoing the body', async () => {
  const err = await assertRejects(() => readJson(post('{"name": "secret-text'), Schema), HttpError);
  assertEquals(err.status, 400);
  assertEquals(err.message.includes('secret-text'), false);
});

Deno.test('readJson: schema errors name fields, never values', async () => {
  const err = await assertRejects(
    () => readJson(post(JSON.stringify({ name: 'my private words' })), Schema),
    HttpError,
  );
  assertEquals(err.status, 400);
  assertStringIncludes(err.message, 'name');
  assertEquals(err.message.includes('private'), false);
});

Deno.test('withErrors: HttpError → its JSON; unknown error → 500 with nothing leaked', async () => {
  const known = await withErrors('t', () => Promise.reject(new HttpError('rate', 'Slow down.')))(
    post('{}'),
  );
  assertEquals(known.status, 429);
  assertEquals(await known.json(), { error: 'rate', message: 'Slow down.' });

  const { result, lines } = await captureConsole(() =>
    withErrors('t', () => Promise.reject(new Error('row contains "hello my love"')))(post('{}')),
  );
  assertEquals(result.status, 500);
  assertEquals((await result.json()).error, 'internal');
  assertEquals(lines.length, 1);
  assertEquals(
    lines.some((l) => l.includes('hello my love')),
    false,
    'error messages are not logged',
  );
});
