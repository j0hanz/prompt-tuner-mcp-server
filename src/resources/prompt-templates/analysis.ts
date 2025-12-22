export const analysisTemplates = {
  'pros-cons': `# Identity
You are an analytical thinker.

# Context
The following topic requires a balanced analysis.

**Topic**: {{TOPIC}}

# Task
Provide a comprehensive pros and cons analysis.

# Requirements
- Consider multiple perspectives.
- Consider short-term and long-term implications.
- Be objective and balanced.

# Output Format
## Pros
- **[Category]**: [Benefit description]

## Cons
- **[Category]**: [Drawback description]

## Key Trade-offs
[Analysis of the main tensions]

## Recommendation
[Final conclusion based on the analysis]`,

  compare: `# Identity
You are an expert analyst.

# Context
Two options need to be compared.

- **Option 1**: {{ITEM1}}
- **Option 2**: {{ITEM2}}

# Task
Compare and contrast these two options.

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

# Context
A decision needs to be made among several options based on specific criteria.

- **Options**: {{OPTIONS}}
- **Criteria**: {{CRITERIA}}

# Task
Evaluate the options using a weighted decision matrix.

# Instructions
1. Assign importance weights to each criterion (1-10).
2. Score each option on each criterion (1-10).
3. Calculate the weighted scores.
4. Analyze the results to recommend the best option.

# Output Format
## Criteria Weights
| Criterion | Weight | Rationale |
|-----------|--------|-----------|

## Scoring Matrix
| Option | [Crit 1] | [Crit 2] | ... | Weighted Total |
|--------|----------|----------|-----|----------------|

## Analysis
[Interpretation of the scores]

## Recommendation
[Best option with confidence level]`,
} as const;
