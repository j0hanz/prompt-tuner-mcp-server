import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createServer } from '../src/server.js';

describe('Server', () => {
  it('should create a server instance', () => {
    const server = createServer();
    assert.ok(server);
  });
});
