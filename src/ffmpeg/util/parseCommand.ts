/**
 * Tokenize a command string, handling quoted arguments and stripping outer quotes.
 * - Outer quotes (single or double) are removed.
 * - Inner quotes of the opposite type are preserved as literal characters.
 * - Spaces inside quotes are preserved in the same token.
 * - Adjacent quoted segments are concatenated without the quotes.
 */
export function parseCommand(cmd: string): string[] {
  const substituted = cmd;
  if (!substituted.trim()) return [];

  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < substituted.length) {
    const ch = substituted[i];

    if (inSingleQuote) {
      // Inside single quotes: add everything except the closing quote.
      if (ch === "'") {
        inSingleQuote = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (inDoubleQuote) {
      // Inside double quotes: add everything except the closing quote.
      if (ch === '"') {
        inDoubleQuote = false;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    // Outside quotes
    if (ch === "'") {
      inSingleQuote = true;
      i++;
      continue; // do not add the opening quote
    }

    if (ch === '"') {
      inDoubleQuote = true;
      i++;
      continue; // do not add the opening quote
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current) tokens.push(current);
  return tokens;
}
