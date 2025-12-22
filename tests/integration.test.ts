import { type ChildProcess, spawn } from 'node:child_process';
import { resolve } from 'node:path';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const SERVER_PATH = resolve(import.meta.dirname, '../dist/index.js');
const TIMEOUT_MS = 30_000;

// Check if API key is available for integration tests
const hasApiKey = Boolean(
  process.env.OPENAI_API_KEY ??
  process.env.ANTHROPIC_API_KEY ??
  process.env.GOOGLE_API_KEY
);

// Skip all integration tests if no API key is configured
// These tests require a running server with valid LLM credentials
describe.skipIf(!hasApiKey)('Integration', () => {
  let client: Client;
  let transport: StdioClientTransport;
  let serverProcess: ChildProcess;

  beforeAll(async () => {
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
  }, TIMEOUT_MS);

  afterAll(async () => {
    if (client) {
      await client.close();
    }
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  describe('Capability Negotiation', () => {
    it('should report server info', async () => {
      const serverInfo = client.getServerVersion();
      expect(serverInfo?.name).toBe('prompttuner-mcp');
      expect(serverInfo?.version).toBeDefined();
    });

    it('should advertise tool capability', async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.tools).toBeDefined();
    });

    it('should advertise resource capability', async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.resources).toBeDefined();
    });

    it('should advertise prompt capability', async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.prompts).toBeDefined();
    });

    it('should advertise logging capability', async () => {
      const capabilities = client.getServerCapabilities();
      expect(capabilities?.logging).toBeDefined();
    });
  });

  describe('Tool Operations', () => {
    it('should list all tools', async () => {
      const { tools } = await client.listTools();

      expect(tools).toBeInstanceOf(Array);
      expect(tools.length).toBeGreaterThan(0);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('refine_prompt');
      expect(toolNames).toContain('analyze_prompt');
      expect(toolNames).toContain('optimize_prompt');
      expect(toolNames).toContain('detect_format');
      expect(toolNames).toContain('compare_prompts');
      expect(toolNames).toContain('validate_prompt');
    });

    it('should have proper tool metadata', async () => {
      const { tools } = await client.listTools();
      const refineTool = tools.find((t) => t.name === 'refine_prompt');

      expect(refineTool).toBeDefined();
      expect(refineTool?.description).toBeDefined();
      expect(refineTool?.inputSchema).toBeDefined();
    });
  });

  describe('Resource Operations', () => {
    it('should list resources', async () => {
      const { resources } = await client.listResources();

      expect(resources).toBeInstanceOf(Array);
      // Should have template catalog and individual templates
      expect(resources.length).toBeGreaterThan(0);
    });

    it('should read template catalog', async () => {
      const result = await client.readResource({
        uri: 'templates://catalog',
      });

      expect(result.contents).toBeInstanceOf(Array);
      expect(result.contents.length).toBeGreaterThan(0);

      const content = result.contents[0];
      expect(content.mimeType).toBe('application/json');
    });

    it('should read specific template', async () => {
      const result = await client.readResource({
        uri: 'templates://coding/code-review',
      });

      expect(result.contents).toBeInstanceOf(Array);
      expect(result.contents.length).toBeGreaterThan(0);
    });
  });

  describe('Prompt Operations', () => {
    it('should list prompts', async () => {
      const { prompts } = await client.listPrompts();

      expect(prompts).toBeInstanceOf(Array);
      expect(prompts.length).toBeGreaterThan(0);

      const promptNames = prompts.map((p) => p.name);
      expect(promptNames).toContain('quick-optimize');
      expect(promptNames).toContain('analyze');
    });

    it('should get prompt with arguments', async () => {
      const result = await client.getPrompt({
        name: 'quick-optimize',
        arguments: { prompt: 'Test prompt for optimization' },
      });

      expect(result.messages).toBeInstanceOf(Array);
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.messages[0].role).toBe('user');
    });
  });
});
