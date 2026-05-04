import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateId } from './id.js';

describe('generateId', () => {
  it('returns a string', () => {
    const id = generateId();
    assert.equal(typeof id, 'string');
  });

  it('returns unique values', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    assert.equal(ids.size, 100);
  });

  it('is at least 8 chars', () => {
    assert.ok(generateId().length >= 8);
  });
});
