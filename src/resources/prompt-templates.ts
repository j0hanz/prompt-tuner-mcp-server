import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

import { analysisTemplates } from './prompt-templates/analysis.js';
import { codingTemplates } from './prompt-templates/coding.js';
import { dataExtractionTemplates } from './prompt-templates/data-extraction.js';
import { systemPromptTemplates } from './prompt-templates/system-prompts.js';
import { writingTemplates } from './prompt-templates/writing.js';

interface TemplateResources {
  uri: string;
  name: string;
}

// Sanitize user input to prevent injection
function sanitizeInput(input: string, maxLength = 50): string {
  return input
    .replace(/[<>&"'\\\\]/g, '') // Remove potentially dangerous characters
    .slice(0, maxLength);
}

const PROMPT_TEMPLATES: Record<string, Record<string, string>> = {
  coding: codingTemplates,
  writing: writingTemplates,
  analysis: analysisTemplates,
  'system-prompts': systemPromptTemplates,
  'data-extraction': dataExtractionTemplates,
};

const CATEGORIES = Object.keys(PROMPT_TEMPLATES);

const TEMPLATE_CATALOG = Object.entries(PROMPT_TEMPLATES).map(
  ([category, templates]) => ({
    category,
    templates: Object.keys(templates),
  })
);

const TEMPLATE_CATALOG_JSON = JSON.stringify(TEMPLATE_CATALOG, null, 2);

const TEMPLATE_RESOURCES: TemplateResources[] = [];
for (const [category, templates] of Object.entries(PROMPT_TEMPLATES)) {
  for (const templateName of Object.keys(templates)) {
    TEMPLATE_RESOURCES.push({
      uri: `templates://${category}/${templateName}`,
      name: `${category}/${templateName}`,
    });
  }
}

const ALL_TEMPLATE_NAMES = Object.values(PROMPT_TEMPLATES).flatMap(
  (templates) => Object.keys(templates)
);

function buildCatalogContents(uri: URL): {
  contents: { uri: string; mimeType: string; text: string }[];
} {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: TEMPLATE_CATALOG_JSON,
      },
    ],
  };
}

function listTemplateResources(): { resources: TemplateResources[] } {
  return { resources: TEMPLATE_RESOURCES };
}

function completeCategory(value: string): string[] {
  const normalized = value.toLowerCase();
  return CATEGORIES.filter((category) =>
    category.toLowerCase().startsWith(normalized)
  );
}

function completeName(
  value: string,
  context?: { arguments?: { category?: unknown } }
): string[] {
  const normalized = value.toLowerCase();
  const category = context?.arguments?.category;
  if (typeof category === 'string' && PROMPT_TEMPLATES[category]) {
    return Object.keys(PROMPT_TEMPLATES[category]).filter((name) =>
      name.toLowerCase().startsWith(normalized)
    );
  }

  return ALL_TEMPLATE_NAMES.filter((name) =>
    name.toLowerCase().startsWith(normalized)
  );
}

function buildErrorContents(
  uri: URL,
  message: string
): { contents: { uri: string; text: string }[] } {
  return {
    contents: [
      {
        uri: uri.href,
        text: message,
      },
    ],
  };
}

function resolveCategoryTemplates(
  category: string
): Record<string, string> | null {
  return PROMPT_TEMPLATES[category] ?? null;
}

function buildCategoryError(category: string): string {
  return `Error: Category "${sanitizeInput(category)}" not found. Available: ${CATEGORIES.join(', ')}`;
}

function buildTemplateError(
  category: string,
  name: string,
  available: string[]
): string {
  return `Error: Template "${sanitizeInput(name)}" not found in category "${sanitizeInput(category)}". Available: ${available.join(', ')}`;
}

function buildTemplateContents(
  uri: URL,
  template: string
): { contents: { uri: string; mimeType: string; text: string }[] } {
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/plain',
        text: template,
      },
    ],
  };
}

function handleTemplateRequest(
  uri: URL,
  category: unknown,
  name: unknown
): { contents: { uri: string; text: string; mimeType?: string }[] } {
  const categoryStr = String(category);
  const nameStr = String(name);
  const categoryTemplates = resolveCategoryTemplates(categoryStr);

  if (!categoryTemplates) {
    return buildErrorContents(uri, buildCategoryError(categoryStr));
  }

  const template = categoryTemplates[nameStr];
  if (!template) {
    return buildErrorContents(
      uri,
      buildTemplateError(categoryStr, nameStr, Object.keys(categoryTemplates))
    );
  }

  return buildTemplateContents(uri, template);
}

function registerTemplateCatalogResource(server: McpServer): void {
  server.registerResource(
    'template-catalog',
    'templates://catalog',
    {
      title: 'Prompt Template Catalog',
      description: 'List of all available prompt templates by category',
      mimeType: 'application/json',
    },
    (uri) => buildCatalogContents(uri)
  );
}

function registerPromptTemplateResource(server: McpServer): void {
  server.registerResource(
    'prompt-template',
    new ResourceTemplate('templates://{category}/{name}', {
      list: () => listTemplateResources(),
      complete: {
        category: (value: string) => completeCategory(value),
        name: (value: string, context) => completeName(value, context),
      },
    }),
    {
      title: 'Prompt Template',
      description: 'Get a specific prompt template by category and name',
      mimeType: 'text/plain',
    },
    (uri, { category, name }) => handleTemplateRequest(uri, category, name)
  );
}

export function registerPromptTemplateResources(server: McpServer): void {
  registerTemplateCatalogResource(server);
  registerPromptTemplateResource(server);
}
