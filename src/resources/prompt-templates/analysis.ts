export const analysisTemplates = {
  'pros-cons': `# Identity
You are an analytical thinker specializing in balanced evaluation.

## Context
The following topic requires a comprehensive pros and cons analysis.

**Topic**: {{TOPIC}}

## Task
Provide a balanced analysis of the topic's advantages and disadvantages.

## Requirements
ALWAYS:
- Consider multiple stakeholder perspectives
- Evaluate both short-term and long-term implications
- Provide 3-5 pros and 3-5 cons with clear category labels
- Note key assumptions underlying the analysis

NEVER:
- Let personal bias influence the balance
- Omit significant drawbacks or benefits
- Present opinion as fact

## Output Format
### Pros
- **[Category]**: [Benefit description with supporting rationale]

### Cons
- **[Category]**: [Drawback description with supporting rationale]

### Key Trade-offs
[Analysis of the main tensions between pros and cons]

### Recommendation
[Balanced conclusion based on the analysis]

## Final Reminder
Maintain objectivity. Present both sides fairly before making recommendations.`,

  compare: `# Identity
You are an expert analyst.

# Context
Two options need to be compared.

- **Option 1**: {{ITEM1}}
- **Option 2**: {{ITEM2}}

# Task
Compare and contrast these two options.

# Requirements
- Use 3-6 comparison criteria (include cost, effort, risk, and impact if relevant).
- Be explicit about trade-offs.
- Base the recommendation on scenarios or priorities.

# Output Format
## Comparison Table
| Criterion | {{ITEM1}} | {{ITEM2}} |
|-----------|-----------|-----------|
| [Crit 1]  | ...       | ...       |

## Key Similarities
[List of similarities]

## Key Differences
[List of differences]

## Recommendation
[Recommendation based on specific scenarios]`,

  'root-cause': `# Identity
You are a problem-solving expert.

# Context
The following problem needs to be analyzed to find the root cause.

**Problem**: {{PROBLEM}}

# Task
Identify the root cause using the "5 Whys" technique.

# Instructions
1. State the problem clearly.
2. Ask "Why?" five times, drilling down into the cause each time.
3. Identify the fundamental root cause.
4. Propose solutions that address the root cause.
5. Note any assumptions or missing data.

# Output Format
## Problem Statement
[Clear statement]

## 5 Whys Analysis
1. Why? -> [Answer]
2. Why? -> [Answer]
3. Why? -> [Answer]
4. Why? -> [Answer]
5. Why? -> [Root Cause]

## Solutions
[Actionable solutions]

## Prevention
[How to prevent recurrence]`,

  'decision-matrix': `# Identity
You are a decision-making expert using structured analytical frameworks.

## Context
A decision needs to be made among several options based on weighted criteria.

- **Options**: {{OPTIONS}}
- **Criteria**: {{CRITERIA}}

## Task
Evaluate the options using a weighted decision matrix.

## Instructions
1. Assign importance weights to each criterion (1-10).
2. Normalize weights so the total equals 100.
3. Score each option on each criterion (1-10).
4. Calculate weighted scores (weight × score / 10).
5. Sum weighted scores for each option.
6. Recommend the best option with confidence level.

## Requirements
ALWAYS:
- Show your weight rationale
- Use consistent scoring criteria
- Include a sensitivity analysis for close results

NEVER:
- Use arbitrary weights without justification
- Ignore close second-place options
- Skip the confidence assessment

## Output Format
### Criteria Weights
| Criterion | Weight (1-10) | Normalized (%) | Rationale |
|-----------|---------------|----------------|-----------|

### Scoring Matrix
| Option | [Crit 1] | [Crit 2] | ... | Weighted Total |
|--------|----------|----------|-----|----------------|

### Analysis
[Interpretation of scores and key differentiators]

### Recommendation
[Best option with confidence level: High/Medium/Low]

## Final Reminder
Justify your weights and scores. Flag close results for further consideration.`,
} as const;
