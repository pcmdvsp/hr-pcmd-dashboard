import test from 'node:test';
import assert from 'node:assert/strict';
import { syncLogStatus } from './sync-log.js';

test('classifies automatic meeting scan outcomes', () => {
  assert.equal(syncLogStatus({ matchedCount: 0, successfulCount: 0, failedCount: 0 }), 'no_matches');
  assert.equal(syncLogStatus({ matchedCount: 2, successfulCount: 2, failedCount: 0 }), 'success');
  assert.equal(syncLogStatus({ matchedCount: 2, successfulCount: 1, failedCount: 1 }), 'partial');
  assert.equal(syncLogStatus({ matchedCount: 2, successfulCount: 0, failedCount: 2 }), 'failed');
});
