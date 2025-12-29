export const PATTERNS = {
  exampleIndicators:
    /(?:^|\s|[([{])(example:|for example|e\.g\.|such as|here's an example|input:|output:|sample:|demonstration:)(?:$|\s|[)\]}.!?,])/i,
  stepByStepIndicators:
    /(?:^|\s|[([{])(step by step|step-by-step|first,|then,|finally,|1\.|2\.|3\.|let's think|let's work through|let's analyze|let's break|systematically)(?:$|\s|[)\]}.!?,])/i,
  xmlStructure: /<[a-z_]+>[^<]*<\/[a-z_]+>/is,
  markdownStructure: /^#+\s|^\*\s|^-\s|^\d+\.\s|```/m,
  jsonStructure: /^\s*\{[\s\S]*\}\s*$|^\s*\[[\s\S]*\]\s*$/,
  claudePatterns:
    /<(thinking|response|context|instructions|example|task|requirements|output_format|rules|constraints)>/i,
  gptPatterns: /^##\s|^###\s|\*\*[^*]+\*\*|^>\s/m,
  vagueWords:
    /\b(something|stuff|things|maybe|kind of|sort of|etc|whatever|somehow|certain|various)\b/gi,
  hasRole:
    /\b(you are|act as|as a|role:|persona:|your role|you're an?|imagine you are)\b/i,
  fewShotStructure:
    /<example>|Example \d+:|Input:|Output:|###\s*Example|Q:|A:/i,
} as const;
