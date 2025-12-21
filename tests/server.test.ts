import { describe, expect, it } from 'vitest';

import { createServer } from '../src/server.js';

describe('Server', () => {
  it('should create a server instance', () => {
    const server = createServer();
    expect(server).toBeDefined();
  });
});
