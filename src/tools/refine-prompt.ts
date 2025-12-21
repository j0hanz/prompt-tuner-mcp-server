import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getCachedRefinement, setCachedRefinement } from '../lib/cache.js';
import {
  createErrorResponse,
  createSuccessResponse,
  ErrorCode,
  logger,
} from '../lib/errors.js';
import { refineLLM } from '../lib/llm.js';
import { resolveFormat } from '../lib/prompt-analysis.js';
import {
  validateFormat,
  validatePrompt,
  validateTechnique,
} from '../lib/validation.js';
import {
  RefinePromptInputSchema,
  RefinePromptOutputSchema,
} from '../schemas/index.js';

export function registerRefinePromptTool(server: McpServer): void {
  server.registerTool(
    'refine_prompt',
    {
      title: 'Refine Prompt',
      description:
        'Fix grammar, improve clarity, and apply optimization techniques. Use when: user asks to fix/improve/optimize a prompt, prompt has typos, or prompt is vague. Default technique: "basic" for quick fixes. Use "comprehensive" for best results.',
      inputSchema: RefinePromptInputSchema,
      outputSchema: RefinePromptOutputSchema,
      annotations: {
        readOnlyHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      prompt,
      technique,
      targetFormat,
    }): Promise<
      | ReturnType<typeof createSuccessResponse>
      | ReturnType<typeof createErrorResponse>
    > => {
      try {
        const validatedPrompt = validatePrompt(prompt);
        const validatedTechnique = validateTechnique(technique);
        const validatedFormat = validateFormat(targetFormat);
        const resolvedFormat = resolveFormat(validatedFormat, validatedPrompt);

        const cached = getCachedRefinement(
          validatedPrompt,
          validatedTechnique,
          resolvedFormat
        );
        if (cached) {
          logger.debug('Cache hit for refinement');
          return createSuccessResponse(cached, {
            ok: true,
            original: validatedPrompt,
            refined: cached,
            corrections: ['Retrieved from cache'],
            technique: validatedTechnique,
            targetFormat: resolvedFormat,
            usedFallback: false,
            fromCache: true,
          });
        }

        const refined = await refineLLM(
          validatedPrompt,
          validatedTechnique,
          resolvedFormat,
          2000,
          60000
        );

        const finalCorrections: string[] = [];
        if (refined !== validatedPrompt) {
          finalCorrections.push('Applied LLM refinement');
          finalCorrections.push(`Technique: ${validatedTechnique}`);
          setCachedRefinement(
            validatedPrompt,
            validatedTechnique,
            resolvedFormat,
            refined
          );
        } else {
          finalCorrections.push(
            'No changes needed - prompt is already well-formed'
          );
        }

        return createSuccessResponse(refined, {
          ok: true,
          original: validatedPrompt,
          refined,
          corrections: finalCorrections,
          technique: validatedTechnique,
          targetFormat: resolvedFormat,
          usedFallback: false,
          fromCache: false,
        });
      } catch (error) {
        return createErrorResponse(error, ErrorCode.E_LLM_FAILED, prompt);
      }
    }
  );
}
