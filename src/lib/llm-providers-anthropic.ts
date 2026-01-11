import Anthropic from '@anthropic-ai/sdk';

import { LLM_MAX_TOKENS } from '../config/constants.js';
import type {
  LLMClient,
  LLMProvider,
  LLMRequestOptions,
} from '../config/types.js';
import { runTextCompletion } from './llm-providers-completion.js';
import {
  buildAnthropicRequest,
  extractAnthropicText,
} from './llm-providers/requests.js';

export class AnthropicClient implements LLMClient {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly provider: LLMProvider = 'anthropic';

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    const request = buildAnthropicRequest(this.model, prompt, maxTokens);
    return runTextCompletion(
      this.provider,
      this.model,
      options,
      (requestOptions) => this.client.messages.create(request, requestOptions),
      extractAnthropicText
    );
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}
