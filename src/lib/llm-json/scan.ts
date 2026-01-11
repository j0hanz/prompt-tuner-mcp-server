type JsonBracket = '{' | '}' | '[' | ']';
type JsonOpenBracket = '{' | '[';

interface JsonScanState {
  startIndex: number;
  stack: JsonOpenBracket[];
  inString: boolean;
  escaped: boolean;
}

function isOpeningBracket(value: string): value is JsonOpenBracket {
  return value === '{' || value === '[';
}

function isClosingBracket(value: string): value is '}' | ']' {
  return value === '}' || value === ']';
}

function matchesBracket(open: JsonOpenBracket, close: '}' | ']'): boolean {
  return (open === '{' && close === '}') || (open === '[' && close === ']');
}

function createScanState(): JsonScanState {
  return { startIndex: -1, stack: [], inString: false, escaped: false };
}

function startFragmentIfNeeded(
  state: JsonScanState,
  char: string,
  index: number
): boolean {
  if (state.startIndex !== -1) return false;
  if (!isOpeningBracket(char)) return false;
  state.startIndex = index;
  state.stack.push(char);
  return true;
}

function enterStringIfNeeded(state: JsonScanState, char: string): boolean {
  if (char !== '"') return false;
  state.inString = true;
  return true;
}

function advanceStringState(state: JsonScanState, char: string): void {
  if (state.escaped) {
    state.escaped = false;
    return;
  }
  if (char === '\\') {
    state.escaped = true;
    return;
  }
  if (char === '"') {
    state.inString = false;
  }
}

function updateStringState(state: JsonScanState, char: string): boolean {
  if (!state.inString) {
    return enterStringIfNeeded(state, char);
  }
  advanceStringState(state, char);
  return true;
}

function pushBracketIfOpen(state: JsonScanState, char: string): boolean {
  if (!isOpeningBracket(char)) return false;
  state.stack.push(char);
  return true;
}

function isScanComplete(state: JsonScanState): boolean {
  return state.stack.length === 0 && state.startIndex !== -1;
}

function getMatchingOpenBracket(
  state: JsonScanState,
  char: '}' | ']'
): JsonOpenBracket | null {
  const last = state.stack[state.stack.length - 1];
  if (!last || !matchesBracket(last, char)) return null;
  return last;
}

function handleCloseBracket(
  state: JsonScanState,
  char: string,
  text: string,
  index: number
): string | null {
  if (!isClosingBracket(char)) return null;
  if (!getMatchingOpenBracket(state, char)) return null;
  state.stack.pop();
  return isScanComplete(state)
    ? text.slice(state.startIndex, index + 1).trim()
    : null;
}

function processScanChar(
  state: JsonScanState,
  char: string,
  text: string,
  index: number
): string | null {
  if (startFragmentIfNeeded(state, char, index)) return null;
  if (state.startIndex === -1) return null;
  if (updateStringState(state, char)) return null;
  if (pushBracketIfOpen(state, char)) return null;
  return handleCloseBracket(state, char, text, index);
}

export function extractFirstJsonFragment(text: string): string | null {
  const state = createScanState();

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as JsonBracket | '"' | '\\';
    const fragment = processScanChar(state, char, text, i);
    if (fragment) return fragment;
  }

  return null;
}
