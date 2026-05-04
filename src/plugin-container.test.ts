import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PluginContainer } from './plugin-container.js';

describe('PluginContainer', () => {
  it('starts with null sessionId', () => {
    const c = new PluginContainer();
    assert.equal(c.sessionId, null);
  });

  it('starts with empty inFlight map', () => {
    const c = new PluginContainer();
    assert.equal(c.inFlight.size, 0);
  });

  it('starts with empty loggedMessages set', () => {
    const c = new PluginContainer();
    assert.equal(c.loggedMessages.size, 0);
  });
});
