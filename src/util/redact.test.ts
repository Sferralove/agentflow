import { describe, it } from 'node:test';
import assert from 'node:assert';
import { redactString, redactSecrets } from './redact.js';

describe('redactString', () => {
  it('redacts OpenAI keys', () => {
    assert.strictEqual(redactString('sk-proj-abc123def456ghi789jkl'), '***REDACTED***');
    assert.ok(redactString('OPENAI_API_KEY=sk-ant-api03-xxx').includes('***REDACTED***'));
  });

  it('redacts Bearer tokens', () => {
    assert.ok(redactString('Bearer gh_token_12345').includes('***REDACTED***'));
    assert.ok(redactString('Authorization: Bearer xyz').includes('***REDACTED***'));
  });

  it('redacts password patterns', () => {
    assert.ok(redactString('password: "secret123"').includes('***REDACTED***'));
    assert.ok(redactString('PASSWORD="hunter2"').includes('***REDACTED***'));
  });

  it('redacts JWT tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    assert.strictEqual(redactString(jwt), '***REDACTED***');
  });

  it('redacts connection strings', () => {
    assert.strictEqual(redactString('postgres://user:pass123@localhost/db'), '***REDACTED***');
    assert.strictEqual(redactString('mongodb://admin:secret@host:27017'), '***REDACTED***');
  });

  it('leaves safe strings unchanged', () => {
    assert.strictEqual(redactString('hello world'), 'hello world');
    assert.strictEqual(redactString('npm install express'), 'npm install express');
    assert.strictEqual(redactString(''), '');
  });
});

describe('redactSecrets', () => {
  it('recursively redacts objects', () => {
    const input = {
      env: { OPENAI_API_KEY: 'sk-abc123' },
      headers: { Authorization: 'Bearer token123' },
      safe: 'normal text',
    };
    const result = redactSecrets(input) as Record<string, unknown>;
    const env = result.env as Record<string, unknown>;
    const headers = result.headers as Record<string, unknown>;
    assert.strictEqual(env.OPENAI_API_KEY, '***REDACTED***');
    assert.strictEqual(headers.Authorization, '***REDACTED***');
    assert.strictEqual(result.safe, 'normal text');
  });

  it('handles arrays', () => {
    const result = redactSecrets(['safe', 'sk-abc123']) as string[];
    assert.strictEqual(result[0], 'safe');
    assert.strictEqual(result[1], '***REDACTED***');
  });

  it('handles null and primitives', () => {
    assert.strictEqual(redactSecrets(null), null);
    assert.strictEqual(redactSecrets(42), 42);
    assert.strictEqual(redactSecrets(true), true);
  });

  it('respects maxDepth', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: 'sk-secret' } } } } } } };
    const result = redactSecrets(deep, 3) as Record<string, unknown>;
    // At depth 3, the inner objects are not traversed
    assert.ok(JSON.stringify(result).includes('sk-secret'), 'secret beyond depth should pass through');
  });
});
