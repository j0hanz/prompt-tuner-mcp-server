const CODE_FENCE = '```';

function isWhitespace(char: string): boolean {
  return char.trim() === '';
}

function skipWhitespace(text: string, start: number): number {
  let cursor = start;
  while (cursor < text.length && isWhitespace(text.charAt(cursor))) {
    cursor += 1;
  }
  return cursor;
}

function readFenceToken(
  text: string,
  start: number
): { token: string | null; end: number } {
  if (start >= text.length || isWhitespace(text.charAt(start))) {
    return { token: null, end: start };
  }
  let end = start;
  while (end < text.length && !isWhitespace(text.charAt(end))) {
    end += 1;
  }
  return { token: text.slice(start, end), end };
}

function stripStartFence(text: string): string {
  const cursor = skipWhitespace(text, 0);
  if (!text.startsWith(CODE_FENCE, cursor)) return text;

  let index = cursor + CODE_FENCE.length;
  const tokenInfo = readFenceToken(text, index);
  if (tokenInfo.token) {
    if (tokenInfo.token.toLowerCase() !== 'json') return text;
    index = tokenInfo.end;
  }

  index = skipWhitespace(text, index);
  return text.slice(index);
}

function stripEndFence(text: string): string {
  let end = text.length - 1;
  while (end >= 0 && isWhitespace(text.charAt(end))) {
    end -= 1;
  }
  if (end < CODE_FENCE.length - 1) return text;
  const fenceStart = end - (CODE_FENCE.length - 1);
  if (text.slice(fenceStart, end + 1) !== CODE_FENCE) return text;
  return text.slice(0, fenceStart);
}

export function stripCodeBlockMarkers(text: string): string {
  const withoutStart = stripStartFence(text);
  const withoutEnd = stripEndFence(withoutStart);
  return withoutEnd.trim();
}
