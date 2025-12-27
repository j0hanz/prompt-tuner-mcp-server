import Anthropic from '@anthropic-ai/sdk';

import { GoogleGenAI, HarmBlockThreshold, HarmCategory } from '@google/genai';

import OpenAI from 'openai';

import { LLM_MAX_TOKENS } from '../config/constants.js';
import { config } from '../config/env.js';
import type {
  LLMClient,
  LLMProvider,
  LLMRequestOptions,
} from '../config/types.js';
import {
  buildAnthropicRequest,
  buildOpenAIRequest,
  checkAborted,
  createCompletion,
  DEFAULT_TIMEOUT_MS,
  extractAnthropicText,
  extractOpenAIText,
} from './llm-providers/helpers.js';
import { runGeneration } from './llm-runtime.js';

abstract class BaseCompletionClient<TRequest, TResponse> implements LLMClient {
  protected abstract readonly provider: LLMProvider;
  protected readonly model: string;

  protected constructor(model: string) {
    this.model = model;
  }

  protected abstract buildRequest(prompt: string, maxTokens: number): TRequest;

  protected abstract createRequest(
    request: TRequest,
    requestOptions: { timeout: number; signal?: AbortSignal }
  ): Promise<TResponse>;

  protected abstract extractText(response: TResponse): string;

  async generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return runGeneration(
      this.provider,
      () =>
        createCompletion(
          options,
          (requestOptions) =>
            this.createRequest(
              this.buildRequest(prompt, maxTokens),
              requestOptions
            ),
          (response) => this.extractText(response)
        ),
      options?.signal
    );
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

class OpenAIClient extends BaseCompletionClient<
  OpenAI.Chat.Completions.ChatCompletionCreateParams,
  OpenAI.Chat.Completions.ChatCompletion
> {
  private readonly client: OpenAI;
  protected readonly provider: LLMProvider = 'openai';

  constructor(apiKey: string, model: string) {
    super(model);
    this.client = new OpenAI({ apiKey });
  }

  protected buildRequest(
    prompt: string,
    maxTokens: number
  ): OpenAI.Chat.Completions.ChatCompletionCreateParams {
    return buildOpenAIRequest(this.model, prompt, maxTokens);
  }

  protected createRequest(
    request: OpenAI.Chat.Completions.ChatCompletionCreateParams,
    requestOptions: { timeout: number; signal?: AbortSignal }
  ): Promise<OpenAI.Chat.Completions.ChatCompletion> {
    return this.client.chat.completions.create(
      request,
      requestOptions
    ) as Promise<OpenAI.Chat.Completions.ChatCompletion>;
  }

  protected extractText(
    response: OpenAI.Chat.Completions.ChatCompletion
  ): string {
    return extractOpenAIText(response);
  }
}

class AnthropicClient extends BaseCompletionClient<
  Anthropic.Messages.MessageCreateParams,
  Anthropic.Messages.Message
> {
  private readonly client: Anthropic;
  protected readonly provider: LLMProvider = 'anthropic';

  constructor(apiKey: string, model: string) {
    super(model);
    this.client = new Anthropic({ apiKey });
  }

  protected buildRequest(
    prompt: string,
    maxTokens: number
  ): Anthropic.Messages.MessageCreateParams {
    return buildAnthropicRequest(this.model, prompt, maxTokens);
  }

  protected createRequest(
    request: Anthropic.Messages.MessageCreateParams,
    requestOptions: { timeout: number; signal?: AbortSignal }
  ): Promise<Anthropic.Messages.Message> {
    return this.client.messages.create(
      request,
      requestOptions
    ) as Promise<Anthropic.Messages.Message>;
  }

  protected extractText(response: Anthropic.Messages.Message): string {
    return extractAnthropicText(response);
  }
}

// Google safety categories for content filtering
const GOOGLE_SAFETY_CATEGORIES = [
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
  HarmCategory.HARM_CATEGORY_CIVIC_INTEGRITY,
] as const;

type GoogleGenerateResponse = Awaited<
  ReturnType<GoogleGenAI['models']['generateContent']>
>;

class GoogleClient implements LLMClient {
  private readonly client: GoogleGenAI;
  private readonly model: string;
  private readonly provider: LLMProvider = 'google';

  constructor(apiKey: string, model: string) {
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async generateText(
    prompt: string,
    maxTokens = LLM_MAX_TOKENS,
    options?: LLMRequestOptions
  ): Promise<string> {
    return runGeneration(
      this.provider,
      () => this.requestCompletion(prompt, maxTokens, options),
      options?.signal
    );
  }

  private async requestCompletion(
    prompt: string,
    maxTokens: number,
    options?: LLMRequestOptions
  ): Promise<string> {
    const timeoutSignal = AbortSignal.timeout(
      options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );
    const combinedSignal = options?.signal
      ? AbortSignal.any([options.signal, timeoutSignal])
      : timeoutSignal;

    checkAborted(combinedSignal);
    const response = await this.executeRequest(prompt, maxTokens, {
      ...options,
      signal: combinedSignal,
    });
    return response.trim();
  }

  private buildSafetySettings(): {
    category: HarmCategory;
    threshold: HarmBlockThreshold;
  }[] {
    // WARNING: Disabling safety settings can expose the application to harmful content.
    // Use with caution and only in trusted environments.
    const threshold = config.GOOGLE_SAFETY_DISABLED
      ? HarmBlockThreshold.OFF
      : HarmBlockThreshold.BLOCK_ONLY_HIGH;

    return GOOGLE_SAFETY_CATEGORIES.map((category) => ({
      category,
      threshold,
    }));
  }

  private async executeRequest(
    prompt: string,
    maxTokens: number,
    options?: LLMRequestOptions
  ): Promise<string> {
    const generatePromise = this.client.models.generateContent({
      model: this.model,
      contents: prompt,
      config: {
        maxOutputTokens: maxTokens,
        safetySettings: this.buildSafetySettings(),
      },
    });

    const { signal } = options ?? {};

    if (!signal) {
      const response = await generatePromise;
      return this.finalizeResponse(response);
    }

    return this.executeWithAbort(generatePromise, signal);
  }

  private async executeWithAbort(
    generatePromise: Promise<GoogleGenerateResponse>,
    signal: AbortSignal
  ): Promise<string> {
    const abortPromise = new Promise<never>((_, reject) => {
      const onAbort = (): void => {
        reject(new Error('Request aborted'));
      };
      signal.addEventListener('abort', onAbort);
      void generatePromise.finally(() => {
        signal.removeEventListener('abort', onAbort);
      });
    });

    try {
      const response = await Promise.race([generatePromise, abortPromise]);
      return this.finalizeResponse(response);
    } catch (error) {
      if (signal.aborted) {
        void generatePromise.catch(() => {});
      }
      throw error;
    }
  }

  private finalizeResponse(response: GoogleGenerateResponse): string {
    if (String(response.candidates?.[0]?.finishReason) === 'SAFETY') {
      throw new Error('Content filtered by safety settings');
    }

    return response.text ?? '';
  }

  getProvider(): LLMProvider {
    return this.provider;
  }

  getModel(): string {
    return this.model;
  }
}

export { AnthropicClient, GoogleClient, OpenAIClient };
