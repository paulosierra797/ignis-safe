const OFFENSIVE_TERMS = [
  'asshole',
  'bastard',
  'bitch',
  'bullshit',
  'dick',
  'fuck',
  'fucker',
  'motherfucker',
  'shit',
  'slut',
  'whore',
  'bobo',
  'gago',
  'gaga',
  'leche',
  'pakyu',
  'putangina',
  'putang ina',
  'tanga',
  'ulol',
];

const CHARACTER_VARIANTS: Record<string, string> = {
  a: '[a@4]',
  e: '[e3]',
  i: '[i1!]',
  o: '[o0]',
  s: '[s$5]',
  t: '[t7]',
};

const termPattern = (term: string) => term
  .toLowerCase()
  .split('')
  .map((character) => {
    if (/\s/u.test(character)) return '[\\s._-]+';
    const escaped = character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return CHARACTER_VARIANTS[character] || escaped;
  })
  .join('[\\s._-]*');

const OFFENSIVE_PATTERNS = OFFENSIVE_TERMS.map((term) => new RegExp(
  `(^|[^\\p{L}\\p{N}])(${termPattern(term)})(?=$|[^\\p{L}\\p{N}])`,
  'giu',
));

export const maskOffensiveLanguage = (value: string) => OFFENSIVE_PATTERNS.reduce(
  (result, pattern) => result.replace(pattern, (_match, prefix: string, offensive: string) => (
    prefix + offensive.replace(/[^\s]/gu, '*')
  )),
  value,
);
