import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';

interface TemplateResource {
  uri: string;
  name: string;
  title: string;
  description: string;
  category: string;
  mimeType: string;
  text: string;
}

const TEMPLATE_CATALOG_URI = 'templates://catalog';

const TEMPLATE_RESOURCES: TemplateResource[] = [
  {
    uri: 'templates://coding/code-review',
    name: 'code-review',
    title: 'Code Review Checklist',
    description: 'Structured checklist for reviewing code changes.',
    category: 'coding',
    mimeType: 'text/markdown',
    text: `# Code Review Checklist

## Role
You are a senior software engineer performing a code review.

## Goals
- Identify correctness bugs and edge cases
- Flag security and privacy risks
- Note performance, reliability, and maintainability issues
- Suggest concrete improvements

## Review Checklist
- Correctness: Does the change do what it claims in all cases?
- Security: Any injection, auth, or data exposure issues?
- Reliability: Error handling, retries, timeouts, and cleanup
- Performance: Hot paths, allocations, latency, and caching
- Consistency: Aligns with existing conventions and patterns
- Tests: Adequate coverage and negative cases

## Output Format
1. Critical issues (if any)
2. Warnings
3. Suggestions
4. Tests to add or run
`,
  },
];

interface TemplateCatalogEntry {
  uri: string;
  name: string;
  title: string;
  description: string;
  category: string;
  mimeType: string;
}

const TEMPLATE_CATALOG: TemplateCatalogEntry[] = TEMPLATE_RESOURCES.map(
  ({ uri, name, title, description, category, mimeType }) => ({
    uri,
    name,
    title,
    description,
    category,
    mimeType,
  })
);

function buildTextResource(
  uri: string,
  mimeType: string,
  text: string
): ReadResourceResult {
  return {
    contents: [
      {
        uri,
        mimeType,
        text,
      },
    ],
  };
}

function buildCatalogResource(): ReadResourceResult {
  const payload = JSON.stringify({ templates: TEMPLATE_CATALOG }, null, 2);
  return buildTextResource(TEMPLATE_CATALOG_URI, 'application/json', payload);
}

export function registerTemplateResources(server: McpServer): void {
  server.registerResource(
    'template-catalog',
    TEMPLATE_CATALOG_URI,
    {
      title: 'Template Catalog',
      description: 'Available prompt templates.',
      mimeType: 'application/json',
    },
    () => buildCatalogResource()
  );

  for (const template of TEMPLATE_RESOURCES) {
    server.registerResource(
      `template-${template.category}-${template.name}`,
      template.uri,
      {
        title: template.title,
        description: template.description,
        mimeType: template.mimeType,
      },
      () => buildTextResource(template.uri, template.mimeType, template.text)
    );
  }
}
