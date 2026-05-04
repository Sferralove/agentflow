import { describe, it } from 'node:test';
import assert from 'node:assert';

// Test the security helpers at module scope
// We import the module to access internal functions; for now test the logic inline

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
  } catch {
    return false;
  }
}

describe('isLocalhostOrigin', () => {
  it('allows localhost on any port', () => {
    assert.strictEqual(isLocalhostOrigin('http://localhost:3001'), true);
    assert.strictEqual(isLocalhostOrigin('http://localhost:5173'), true);
    assert.strictEqual(isLocalhostOrigin('http://localhost'), true);
  });

  it('allows 127.0.0.1', () => {
    assert.strictEqual(isLocalhostOrigin('http://127.0.0.1:3001'), true);
    assert.strictEqual(isLocalhostOrigin('https://127.0.0.1:3001'), true);
  });

  it('allows IPv6 loopback', () => {
    assert.strictEqual(isLocalhostOrigin('http://[::1]:3001'), true);
  });

  it('rejects external hosts', () => {
    assert.strictEqual(isLocalhostOrigin('http://192.168.1.1:3001'), false);
    assert.strictEqual(isLocalhostOrigin('http://example.com:3001'), false);
    assert.strictEqual(isLocalhostOrigin('http://0.0.0.0:3001'), false);
  });

  it('rejects empty or invalid origins', () => {
    assert.strictEqual(isLocalhostOrigin(''), false);
    assert.strictEqual(isLocalhostOrigin('not-a-url'), false);
  });
});
