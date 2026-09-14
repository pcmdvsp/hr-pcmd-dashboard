import test from 'node:test';
import assert from 'node:assert/strict';
import { overallSyncStatus, parseSyncModes, uniqueMeetingsByExternalId } from './sync-batch.js';

test('accepts one legacy mode or a deduplicated ordered mode batch', () => {
  assert.deepEqual(parseSyncModes({ mode: 'today' }), ['today']);
  assert.deepEqual(parseSyncModes({ modes: ['tomorrow', 'in2days', 'in3days', 'tomorrow'] }), [
    'tomorrow', 'in2days', 'in3days',
  ]);
  assert.throws(() => parseSyncModes({ modes: [] }), /valid mode/);
  assert.throws(() => parseSyncModes({ modes: ['tomorrow', 'invalid'] }), /valid mode/);
});

test('deduplicates overlapping eOffice responses by recID', () => {
  assert.deepEqual(uniqueMeetingsByExternalId([
    { recID: 'meeting-1', value: 'first' },
    { recID: 'meeting-2', value: 'only' },
    { recID: 'meeting-1', value: 'last' },
  ]), [
    { recID: 'meeting-1', value: 'last' },
    { recID: 'meeting-2', value: 'only' },
  ]);
});

test('summarizes a multi-mode batch', () => {
  assert.equal(overallSyncStatus([{ status: 'success' }, { status: 'no_matches' }]), 'success');
  assert.equal(overallSyncStatus([{ status: 'success' }, { status: 'failed' }]), 'partial');
  assert.equal(overallSyncStatus([{ status: 'failed' }, { status: 'failed' }]), 'failed');
  assert.equal(overallSyncStatus([{ status: 'no_matches' }, { status: 'no_matches' }]), 'no_matches');
});
