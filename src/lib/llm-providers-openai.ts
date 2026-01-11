import OpenAI from 'openai';

import { LLM_MAX_TOKENS } from '../config/constants.js';
import type {
  LLMClient,
  LLMProvider,
  LLMRequestOptions,
} from '../config/types.js';
import { runTextCompletion } from './llm-providers-completion.js';
import {
  buildOpenAIRequest,
  extractOpenAIText,
} from './llm-providers/helpers.js';

export class OpenAIClient implements LLMClient {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'openai';

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    const request = buildOpenAIRequest(this.model, prompt, maxTokens);
    return runTextCompletion(
      this.provider,
      this.model,
      options,
      (requestOptions) =>
        this.client.chat.completions.create(request, requestOptions),
      extractOpenAIText
    );
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}
