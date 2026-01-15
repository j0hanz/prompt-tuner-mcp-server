# PromptTuner MCP Instructions

> **Guidance for the Agent:** These instructions are available as a resource (`internal://instructions`) or prompt (`get-help`). Load them when you are confused about tool usage.

## 1. Core Capability

- **Domain:** Refine, enhance, or structure user prompts via external LLM providers.
- **Primary Resources:** `PromptText`, `WorkflowPrompt`, tool outputs (`fixed`, `boosted`, `prompt`).

## 2. The "Golden Path" Workflows (Critical)

### Workflow A: Fix or boost an existing prompt

1. Choose `fix_prompt` for polishing clarity/flow without restructuring.
2. Choose `boost_prompt` to add structure and specificity.
3. Call the chosen tool with `prompt`.
4. Parse the JSON text response and use the `fixed` or `boosted` field.
   > **Constraint:** Do not invent tool names or inputs.

### Workflow B: Create a workflow prompt

1. Call `crafting_prompt` with a clear `request` and optional `constraints`.
2. Optionally set `mode`, `approach`, `tone`, and `verbosity` to shape the output.
3. Parse the JSON text response and use the `prompt` field.

## 3. Tool Nuances & "Gotchas"

- **All tools**:
  - **Side Effects:** Calls an external LLM provider (network + cost). Ask before repeated retries.
  - **Output:** The primary payload is a JSON string in `content`; parse it to access fields.

- **`fix_prompt`**:
  - **Behavior:** Always makes at least minor improvements; preserves structure and length.

- **`boost_prompt`**:
  - **Behavior:** Adds structure and clarifies output format; keeps output concise.

- **`crafting_prompt`**:
  - **Behavior:** Returns Markdown starting with `# Workflow Prompt` and required sections.

## 4. Error Handling Strategy

- If the tool returns `ok: false`, surface the `error.code` and `error.message`.
- If the output JSON is malformed, retry once; then ask the user to re-run or clarify.
