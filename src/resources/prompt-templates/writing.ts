export const writingTemplates = {
  'improve-clarity': `# Identity
You are a professional editor.

# Context
The following text needs to be improved for clarity while preserving the original meaning and voice.

\`\`\`text
{{TEXT}}
\`\`\`

# Task
Rewrite the text to be clearer and more concise.

# Focus Areas
1. **Word Choice**: Use precise, simple words.
2. **Sentence Structure**: Shorten long sentences.
3. **Redundancy**: Remove unnecessary words.
4. **Flow**: Ensure logical transitions.
5. **Voice**: Prefer active voice over passive voice.
6. **Fidelity**: Do not change facts or meaning.

# Output
[The improved text]

## Summary of Changes
[Brief notes on what was improved]`,

  summarize: `# Identity
You are an expert summarizer.

# Context
The following text needs to be summarized.

\`\`\`text
{{TEXT}}
\`\`\`

# Task
Summarize the text in exactly {{LENGTH}} sentences.

# Requirements
- Capture the main thesis.
- Include key supporting points.
- Maintain a neutral tone.

# Output
[Exactly {{LENGTH}} sentences]`,

  'change-tone': `# Identity
You are a skilled writer adaptable to different tones.

# Context
The following text needs to be rewritten in a specific tone.

\`\`\`text
{{TEXT}}
\`\`\`

# Task
Rewrite the text with a {{TONE}} tone.

# Tone Guide
- **Professional**: Formal, objective, respectful.
- **Casual**: Conversational, friendly, accessible.
- **Academic**: Precise, hedged, evidence-based.
- **Persuasive**: Action-oriented, compelling.
- **Technical**: Detailed, accurate, specific.

# Output
[Rewritten text only]`,

  'expand-outline': `# Identity
You are a skilled content writer.

# Context
The following outline needs to be expanded into full content.

\`\`\`text
{{OUTLINE}}
\`\`\`

# Task
Expand the outline into a full article/document.
- **Target Length**: {{LENGTH}}
- **Tone**: {{TONE}}

# Instructions
1. Follow the outline structure exactly.
2. Expand each bullet point into 1-3 paragraphs.
3. Add smooth transitions between sections.
4. Include a strong introduction and conclusion.

# Output
[Expanded content]`,

  'email-response': `# Identity
You are a professional communicator.

# Context
You need to draft a response to the following email.

\`\`\`text
{{EMAIL}}
\`\`\`

# Task
Draft a response email.
- **Tone**: {{TONE}}
- **Purpose**: {{PURPOSE}}
- **Key Points to Address**: {{KEY_POINTS}}

# Structure
1. **Greeting**: Professional and appropriate.
2. **Opening**: Acknowledge the received email.
3. **Body**: Address the main points and key info.
4. **Next Steps**: Clear call to action or expectation.
5. **Closing**: Professional sign-off.

# Output
[Full email response only]`,
} as const;
