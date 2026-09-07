import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLoginPayload,
  cookieHeader,
  encryptLoginValue,
  extractLoginToken,
  updateCookieJar,
} from './eoffice-login.js';

test('encryptLoginValue is deterministic and returns base64 ciphertext', async () => {
  const first = await encryptLoginValue('example');
  const second = await encryptLoginValue('example');
  assert.equal(first, second);
  assert.notEqual(first, 'example');
  assert.match(first, /^[A-Za-z0-9+/]+={0,2}$/);
});

test('buildLoginPayload matches the observed LoginAsync request shape', async () => {
  const payload = await buildLoginPayload({
    username: ' employee ', password: 'secret',
    hdType: '|f056373c69ea4e8b8dd3aaaaaaaaaaaa',
  });
  assert.equal(payload.methodName, 'LoginAsync');
  assert.equal(payload.functionID, 'WP');
  assert.equal(payload.msgBodyData.length, 6);
  assert.equal(payload.msgBodyData[2], '');
  assert.equal(payload.msgBodyData[4], '');
  assert.deepEqual(JSON.parse(payload.msgBodyData[5]), {
    name: 'Chrome', os: 'Windows 10', id: 'f056373c-69ea-4e8b-8dd3-aaaaaaaaaaaa',
  });
});

test('cookie jar keeps cookie name/value only and replaces refreshed cookies', () => {
  const jar = new Map();
  updateCookieJar(jar, new Headers({ 'set-cookie': 'session=first; Path=/; HttpOnly' }));
  updateCookieJar(jar, new Headers({ 'set-cookie': 'session=second; Path=/; HttpOnly' }));
  assert.equal(cookieHeader(jar), 'session=second');
});

test('extractLoginToken reads only the first LoginAsync result object', () => {
  assert.equal(extractLoginToken({ msgBodyData: [{ token: 'session-token' }] }), 'session-token');
  assert.equal(extractLoginToken({ msgBodyData: [JSON.stringify({ token: 'string-token' })] }), 'string-token');
  assert.equal(extractLoginToken({ haveBusinessError: true, msgBodyData: [{ token: 'ignored' }] }), null);
  assert.equal(extractLoginToken({ msgBodyData: [{ access_token: 'wrong-token-kind' }] }), null);
});
