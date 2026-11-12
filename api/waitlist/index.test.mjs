import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { POST } from './index.mjs';

const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
let forwarded;

beforeEach(() => {
  process.env.SITE_URL = 'https://stackprep.de';
  process.env.CONVEX_SITE_URL = 'https://test.convex.site';
  process.env.WAITLIST_API_SECRET = 'test-secret';
  delete process.env.RESEND_API_KEY;
  delete process.env.WAITLIST_FROM_EMAIL;
  forwarded = [];
  globalThis.fetch = async (_url, options) => {
    forwarded.push(JSON.parse(options.body));
    return Response.json({ status: 'pending', sendConfirmation: false });
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
});

const submit = (profession, other) => {
  const form = new FormData();
  form.set('email', 'azubi@example.de');
  form.set('alter', '16plus');
  form.set('einwilligung', 'ja');
  form.set('beruf', profession);
  if (other !== undefined) form.set('berufAndere', other);
  return POST(new Request('https://stackprep.de/api/waitlist', {
    method: 'POST',
    headers: { Origin: 'https://stackprep.de', Accept: 'application/json' },
    body: form,
  }));
};

test('forwards the normalized custom learning subject', async () => {
  assert.equal((await submit('andere', '  Wirtschaft   und Recht  ')).status, 200);
  assert.equal(forwarded[0].profession, 'andere');
  assert.equal(forwarded[0].professionOther, 'Wirtschaft und Recht');
});

test('keeps the custom learning subject optional', async () => {
  for (const value of [undefined, '', '   ']) {
    assert.equal((await submit('andere', value)).status, 200);
  }
  assert.ok(forwarded.every((body) => !('professionOther' in body)));
});

test('ignores stale custom text for a different selection', async () => {
  assert.equal((await submit('fi_ae', 'Medizin')).status, 200);
  assert.ok(!('professionOther' in forwarded[0]));
});

test('rejects oversized text and file uploads before calling Convex', async () => {
  assert.equal((await submit('andere', 'x'.repeat(120))).status, 200);
  assert.equal((await submit('andere', 'x'.repeat(121))).status, 400);
  assert.equal((await submit('andere', new Blob(['Medizin']))).status, 400);
  assert.equal(forwarded.length, 1);
});
