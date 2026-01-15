# AGENTS.md

> **Purpose:** Context and strict guidelines for AI agents working in this repository.

## 1. Project Context

- **Domain:** Model Context Protocol (MCP) stdio server that refines user prompts (fix/boost/crafting) via an LLM provider.
- **Tech Stack:**
  - **Language:** TypeScript (compiler: TypeScript 5.9.3)
  - **Runtime:** Node.js (package `engines.node` is `>=22.0.0`)
  - **Framework/Protocol:** `@modelcontextprotocol/sdk` (MCP server + stdio transport)
  - **Key Libraries:** `zod` (schemas), `pino` (logging), provider SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`)
- **Architecture:** Layered single-package server: CLI entrypoint → MCP server wiring → tool handlers → shared `lib/` utilities.

## 2. Repository Map (High-Level Only)

- `src/`: Production server code (CLI, MCP server, tools, schemas, config, shared utils).
- `src/lib/`: Provider + prompt/telemetry/error utilities used by tools.
- `tests/`: `node:test` suites (unit + MCP integration).
- `.github/workflows/`: CI automation (publish pipeline).
- `docs/`: Static assets (e.g., logo).

> _Note: Ignore `dist`, `node_modules`._

## 3. Operational Commands

- **Environment:** Node.js `>=22.0.0`.
- **Install:** `npm install` (CI uses `npm ci`)
- **Dev Server:** `npm run dev` (runs `tsx watch src/index.ts`)
- **Test:** `npm test` (Node’s built-in test runner via `node --test --import=tsx`)
- **Build:** `npm run build` (TypeScript build via `tsc -p tsconfig.build.json`)

Useful gates:

- `npm run lint`
- `npm run type-check`

## 4. Coding Standards (Style & Patterns)

- **Module system:** ESM (`"type": "module"`) with `moduleResolution: NodeNext`.
- **Imports:** Local imports use `.js` extensions (even in TypeScript source).
- **Naming:** `camelCase` for variables/functions; `PascalCase` for types.
- **Typing:** Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`).
- **Preferred patterns:**
  - Zod schemas are strict (unknown input fields are rejected); parse early in tool handlers.
  - Tool outputs include machine-friendly `structuredContent` and also a JSON string in `content` for backward compatibility.
  - User-provided prompt text is wrapped as data using `wrapPromptData(...)` and the `INPUT_HANDLING_SECTION` guidance.
  - Error responses are created via shared helpers (see `createErrorResponse` usage in tool handlers).

## 5. Agent Behavioral Rules (The “Do Nots”)

- **Prohibited:** Do not use `any` (ESLint forbids it).
- **Prohibited:** Do not add default exports; keep named exports.
- **Prohibited:** Do not omit `.js` on local imports (NodeNext/ESM requires it).
- **Prohibited:** Do not weaken Zod schemas (keep strict objects; reject unknown fields).
- **Prohibited:** Do not write non-MCP output to stdout (stdio transport); log via the project logger / stderr only.
- **Prohibited:** Do not hardcode secrets or echo API keys. Use env vars only (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`).
- **Prohibited:** Do not edit lockfiles manually.

## 6. Testing Strategy

- **Framework:** `node:test`.
- **Approach:**
  - Unit tests validate Zod strictness and prompt wrapping/normalization utilities.
  - Integration tests spin up the server over stdio using the MCP SDK client and run from source (`node --import=tsx src/index.ts`).
  - LLM-backed integration tests are gated on presence of any provider API key in env.

## 7. Evolution & Maintenance

- **Update Rule:** If a convention changes (scripts, tool surface, folder structure, provider behavior), update this file in the same PR.
- **Feedback Loop:** If a build/test/lint/type-check command fails twice, add the root cause + fix to “Common Pitfalls” below.

## 8. Common Pitfalls

- CI publish workflow uses Node `20` while `package.json` declares `engines.node >=22.0.0`; keep these aligned when changing runtime requirements.
- `dev:http` / `start:http` scripts are aliases; the server currently runs over stdio (no HTTP transport).
