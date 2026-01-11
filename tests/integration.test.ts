import assert from 'node:assert/strict';
import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_PATH = resolve(import.meta.dirname, '../dist/index.js');
const TIMEOUT_MS = 30_000;

// Check if API key is available for integration tests
const hasApiKey = Boolean(
  process.env.OPENAI_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  process.env.GOOGLE_API_KEY
);

const describeIntegration = hasApiKey ? describe : describe.skip;

// Skip all integration tests if no API key is configured
// These tests require a running server with valid LLM credentials
describeIntegration('Integration', { timeout: TIMEOUT_MS }, () => {
  let client: Client | undefined;
  let transport: StdioClientTransport | undefined;
  let serverProcess: ChildProcess | undefined;

  before(
    async () => {
      // Start the server process
      serverProcess = spawn('node', [SERVER_PATH], {
        env: { ...process.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Create transport and client
      transport = new StdioClientTransport({
        command: 'node',
        args: [SERVER_PATH],
        env: process.env as Record<string, string>,
      });

      client = new Client(
        { name: 'test-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(transport);
    },
    { timeout: TIMEOUT_MS }
  );

  after(async () => {
    if (client) {
      await client.close();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
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

    it('should advertise resource capability', async () => {
      assert.ok(client);
      const capabilities = client.getServerCapabilities();
      assert.ok(capabilities?.resources);
    });

    it('should advertise prompt capability', async () => {
      assert.ok(client);
      const capabilities = client.getServerCapabilities();
      assert.ok(capabilities?.prompts);
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
    });

    it('should have proper tool metadata', async () => {
      assert.ok(client);
      const { tools } = await client.listTools();
      const fixTool = tools.find((t) => t.name === 'fix_prompt');

      assert.ok(fixTool);
      assert.ok(fixTool.description);
      assert.ok(fixTool.inputSchema);
    });
  });

  describe('Resource Operations', () => {
    it('should list resources', async () => {
      assert.ok(client);
      const { resources } = await client.listResources();

      assert.ok(Array.isArray(resources));
      // Should have template catalog and individual templates
      assert.ok(resources.length > 0);
    });

    it('should read template catalog', async () => {
      assert.ok(client);
      const result = await client.readResource({
        uri: 'templates://catalog',
      });

      assert.ok(Array.isArray(result.contents));
      assert.ok(result.contents.length > 0);

      const content = result.contents[0];
      assert.strictEqual(content?.mimeType, 'application/json');
    });

    it('should read specific template', async () => {
      assert.ok(client);
      const result = await client.readResource({
        uri: 'templates://coding/code-review',
      });

      assert.ok(Array.isArray(result.contents));
      assert.ok(result.contents.length > 0);
    });
  });

  describe('Prompt Operations', () => {
    it('should list prompts', async () => {
      assert.ok(client);
      const { prompts } = await client.listPrompts();

      assert.ok(Array.isArray(prompts));
      assert.ok(prompts.length > 0);

      const promptNames = prompts.map((p) => p.name);
      assert.ok(promptNames.includes('fix'));
      assert.ok(promptNames.includes('boost'));
    });

    it('should get prompt with arguments', async () => {
      assert.ok(client);
      const result = await client.getPrompt({
        name: 'fix',
        arguments: { prompt: 'Test prompt for fixing' },
      });

      assert.ok(Array.isArray(result.messages));
      assert.ok(result.messages.length > 0);
      assert.strictEqual(result.messages[0]?.role, 'user');
    });
  });
});
