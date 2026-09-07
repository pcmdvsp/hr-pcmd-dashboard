import test from 'node:test';
import assert from 'node:assert/strict';
import { vietnamDateUtcRange } from './date-range.js';

test('selected date covers the entire Vietnam day in UTC', () => {
  assert.deepEqual(vietnamDateUtcRange('2026-08-27'), {
    start: '2026-08-26T17:00:00.000Z', end: '2026-08-27T16:59:59.999Z',
  });
});

test('blank input defaults to today in Vietnam across a UTC year boundary', () => {
  for (const input of [undefined, null, '', '   ']) {
    assert.deepEqual(vietnamDateUtcRange(input, new Date('2025-12-31T18:00:00Z')), {
      start: '2025-12-31T17:00:00.000Z', end: '2026-01-01T16:59:59.999Z',
    });
  }
});

test('invalid dates and non-string input are rejected', () => {
  for (const input of ['2026-02-29', '2026-02-30', '27/08/2026', '2026-13-01', 123, {}, []]) {
    assert.throws(() => vietnamDateUtcRange(input));
  }
  assert.equal(vietnamDateUtcRange('2028-02-29').start, '2028-02-28T17:00:00.000Z');
});
