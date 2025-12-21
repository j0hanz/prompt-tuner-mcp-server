// Typo corrections and abbreviation expansions for rule-based refinement

// Common typos and their corrections - Map for O(1) correction lookup
const TYPO_MAP = new Map<string, string>([
  ['teh', 'the'],
  ['adn', 'and'],
  ['taht', 'that'],
  ['recieve', 'receive'],
  ['occured', 'occurred'],
  ['seperate', 'separate'],
  ['definately', 'definitely'],
  ['untill', 'until'],
  ['becuase', 'because'],
  ['wich', 'which'],
  ['wiht', 'with'],
  ['hte', 'the'],
  ['dont', "don't"],
  ['wont', "won't"],
  ['cant', "can't"],
  ['im', "I'm"],
  ['youre', "you're"],
  ['theyre', "they're"],
  ['thier', 'their'],
  ['alot', 'a lot'],
  ['accross', 'across'],
  ['acheive', 'achieve'],
  ['accomodate', 'accommodate'],
  ['apparantly', 'apparently'],
  ['begining', 'beginning'],
  ['beleive', 'believe'],
  ['calender', 'calendar'],
  ['collegue', 'colleague'],
  ['comming', 'coming'],
  ['concious', 'conscious'],
  ['dissapear', 'disappear'],
  ['enviroment', 'environment'],
  ['existance', 'existence'],
  ['finaly', 'finally'],
  ['goverment', 'government'],
  ['grammer', 'grammar'],
  ['havent', "haven't"],
  ['independant', 'independent'],
  ['knowlege', 'knowledge'],
  ['liason', 'liaison'],
  ['mispell', 'misspell'],
  ['neccessary', 'necessary'],
  ['noticable', 'noticeable'],
  ['occurence', 'occurrence'],
  ['peice', 'piece'],
  ['posession', 'possession'],
  ['prefered', 'preferred'],
  ['recomend', 'recommend'],
  ['refered', 'referred'],
  ['relevent', 'relevant'],
  ['remeber', 'remember'],
  ['resistence', 'resistance'],
  ['responsability', 'responsibility'],
  ['succesful', 'successful'],
  ['tommorow', 'tomorrow'],
  ['truely', 'truly'],
  ['usefull', 'useful'],
  ['writting', 'writing'],
  ['funtion', 'function'],
  ['paramater', 'parameter'],
  ['retun', 'return'],
  ['varible', 'variable'],
  ['libary', 'library'],
  ['enpoint', 'endpoint'],
  ['algoritm', 'algorithm'],
  ['dependancy', 'dependency'],
]);

// Combined regex for single-pass typo detection
const TYPO_WORDS = [...TYPO_MAP.keys()];
const COMBINED_TYPO_REGEX = new RegExp(
  `\\\\b(${TYPO_WORDS.join('|')})\\\\b`,
  'gi'
);

// Fix all typos in a single pass using combined regex
export function fixTyposBatch(text: string): {
  fixed: string;
  corrections: string[];
} {
  const corrections: string[] = [];

  const fixed = text.replace(COMBINED_TYPO_REGEX, (match) => {
    const lowerMatch = match.toLowerCase();
    const correction = TYPO_MAP.get(lowerMatch);
    if (correction) {
      corrections.push(`Fixed "${match}" → "${correction}"`);
      // Preserve original case for first letter if original was capitalized
      const firstChar = match[0];
      const correctionFirst = correction[0];
      if (
        firstChar &&
        correctionFirst &&
        firstChar === firstChar.toUpperCase()
      ) {
        return correctionFirst.toUpperCase() + correction.slice(1);
      }
      return correction;
    }
    return match;
  });

  return { fixed, corrections };
}

// Export precompiled typo patterns for tests and faster per-pattern matching.
function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
}

export const TYPO_PATTERNS = TYPO_WORDS.map((typo) => ({
  typo,
  correction: TYPO_MAP.get(typo) ?? '',
  regex: new RegExp(`\\b(${escapeForRegex(typo)})\\b`, 'gi'),
}));

// Legacy per-pattern export removed (dead code). Use `fixTyposBatch()` instead for typo corrections.
