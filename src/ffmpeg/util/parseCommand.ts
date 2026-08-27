// parseCommand.ts
// Provides safe parsing of FFmpeg commands with environment variable substitution
// and robust tokenization that strips outer quotes and preserves inner quotes.

/**
 * Replaces environment variable placeholders like $VAR in a command string.
 * Uses a function replacer to avoid `$&` substitution issues.
 */
export function replaceEnv(
  cmd: string,
  vars: Record<string, string | undefined>,
): string {
  if (!vars) return cmd;
  return cmd.replace(/\$(\w+)/g, (_, key: string) => {
    const value = vars[key];
    return value !== undefined ? value : `$${key}`;
  });
}

/**
 * Tokenize a command string, handling quoted arguments and stripping outer quotes.
 * - Outer quotes (single or double) are removed.
 * - Inner quotes of the opposite type are preserved as literal characters.
 * - Spaces inside quotes are preserved in the same token.
 * - Adjacent quoted segments are concatenated without the quotes.
 */
export function parseCommand(
  cmd: string,
  vars: Record<string, string>,
): string[] {
  const substituted = replaceEnv(cmd, vars);
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

/**
 * A simpler, more relaxed parser that preserves quotes and pairs flags with values.
 * Use this when you need to handle flags like -filter_complex and want to keep
 * quotes exactly as they appear.
 */
export function processUserCode(
  cmdString: string | null | undefined,
): string[] {
  if (!cmdString || typeof cmdString !== 'string') return [];

  // Tokenize with quotes preserved (no stripping).
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let i = 0;

  while (i < cmdString.length) {
    const ch = cmdString[i];

    if (inSingleQuote) {
      if (ch === "'") {
        inSingleQuote = false;
        current += ch;
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      if (ch === '"') {
        inDoubleQuote = false;
        current += ch;
      } else {
        current += ch;
      }
      i++;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
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

  // Pair flags with their following non‑flag values.
  const finalArgs: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const isFlag =
      token.startsWith('-') &&
      token.length > 1 &&
      !token.startsWith('"-') &&
      !token.startsWith("'-");

    if (isFlag) {
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith('-')) {
        finalArgs.push(token);
        finalArgs.push(tokens[i + 1]);
        i++;
      } else {
        finalArgs.push(token);
      }
    } else {
      finalArgs.push(token);
    }
  }

  return finalArgs;
}
