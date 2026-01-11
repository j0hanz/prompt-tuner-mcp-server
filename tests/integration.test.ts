import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = resolve(import.meta.dirname, '../src/index.ts');
const TIMEOUT_MS = 30_000;

// Check if API key is available for integration tests
const hasApiKey = Boolean(
  process.env.OPENAI_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  process.env.GOOGLE_API_KEY
);

const describeIntegration = hasApiKey ? describe : describe.skip;

async function startClient(): Promise<{
  client: Client;
  transport: StdioClientTransport;
}> {
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import=tsx', SERVER_PATH],
    env: process.env as Record<string, string>,
  });

  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} }
  );

  await client.connect(transport);
  return { client, transport };
}

describe('Integration (no API key required)', { timeout: TIMEOUT_MS }, () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;

  before(async () => {
    ({ client, transport } = await startClient());
  });

  after(async () => {
    await client?.close();
    void transport;
  });

  describe('Capability Negotiation', () => {
    it('should report server info', async () => {
      assert.ok(client);
      const serverInfo = client.getServerVersion();
      assert.strictEqual(serverInfo?.name, 'prompttuner-mcp');
      assert.ok(serverInfo?.version);
    });

    it('should advertise tool capability', async () => {
      assert.ok(client);
      const capabilities = client.getServerCapabilities();
      assert.ok(capabilities?.tools);
    });

    it('should advertise logging capability', async () => {
      assert.ok(client);
      const capabilities = client.getServerCapabilities();
      assert.ok(capabilities?.logging);
    });
  });

  describe('Tool Operations', () => {
    it('should list all tools', async () => {
      assert.ok(client);
      const { tools } = await client.listTools();

      assert.ok(Array.isArray(tools));
      assert.ok(tools.length > 0);

      const toolNames = tools.map((t) => t.name);
      assert.ok(toolNames.includes('fix_prompt'));
      assert.ok(toolNames.includes('boost_prompt'));
      assert.ok(toolNames.includes('crafting_prompt'));
    });

    it('should have proper tool metadata', async () => {
      assert.ok(client);
      const { tools } = await client.listTools();
      const fixTool = tools.find((t) => t.name === 'fix_prompt');

      assert.ok(fixTool);
      assert.ok(fixTool.description);
      assert.ok(fixTool.inputSchema);
    });

    // crafting_prompt is LLM-backed; its integration tests live in the LLM-configured suite.
  });
});

// LLM-backed integration checks are only meaningful if a provider key exists.
describeIntegration(
  'Integration (LLM configured)',
  { timeout: TIMEOUT_MS },
  () => {
    let client: Client | undefined;
    let transport: StdioClientTransport | undefined;

    before(async () => {
      ({ client, transport } = await startClient());
    });

    after(async () => {
      await client?.close();
      void transport;
    });

    it('should report server info', async () => {
      assert.ok(client);
      const serverInfo = client.getServerVersion();
      assert.strictEqual(serverInfo?.name, 'prompttuner-mcp');
      assert.ok(serverInfo?.version);
    });

    it('should call crafting_prompt using the configured provider', async () => {
      assert.ok(client);
      const result = (await client.callTool({
        name: 'crafting_prompt',
        arguments: {
          request:
            'Write a short plan to refactor a TypeScript project safely.',
        },
      })) as { content: Array<{ type: string; text?: string }> };

      const firstText = result.content.find(
        (block) => block.type === 'text'
      )?.text;
      assert.ok(firstText);

      const parsed = JSON.parse(firstText) as {
        ok?: unknown;
        prompt?: unknown;
      };

      assert.strictEqual(parsed.ok, true);
      assert.strictEqual(typeof parsed.prompt, 'string');
      assert.ok((parsed.prompt as string).includes('# Workflow Prompt'));
    });
  }
);
