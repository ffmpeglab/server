// src/ffmpeg/command-parser.ts

/**
 * Parse a command string into an array of arguments, preserving quoted strings as single arguments.
 * Replaces $VARIABLE placeholders with their values before parsing.
 * @param cmd - The command string (e.g., `-i $MEDIA_1 -af "loudnorm=I=-16" -y $OUTPUT_PATH`)
 * @param variables - Object mapping variable names to their values (e.g., { MEDIA_1: '/path/file.mp3', OUTPUT_PATH: '/out.mp3' })
 * @returns Array of arguments ready for spawn()
 */
export function parseCommand(
  cmd: string,
  variables: typeof process.env,
): string[] {
  // 1. Replace placeholders
  const resolved = replaceEnv(cmd, variables);
  // 2. Split into arguments while respecting quotes
  const args: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';
  let i = 0;

  while (i < resolved.length) {
    const char = resolved[i];

    if (char === '"' || char === "'") {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        i++;
        continue;
      } else if (char === quoteChar) {
        // End of quoted block
        inQuotes = false;
        quoteChar = '';
        i++;
        continue;
      }
    }

    if (!inQuotes && char === ' ') {
      // End of argument
      if (current.length > 0) {
        args.push(current);
        current = '';
      }
      i++;
      continue;
    }

    // If we're inside quotes or char is not a space, accumulate
    current += char;
    i++;
  }

  // Push the last argument if any
  if (current.length > 0) {
    args.push(current);
  }

  return args;
}

// src/ffmpeg/command-parser.ts

/**
 * Parse a command string into an array of arguments, preserving quoted strings as single arguments.
 * Replaces $VARIABLE placeholders with their values before parsing.
 * @param cmd - The command string (e.g., `-i $MEDIA_1 -af "loudnorm=I=-16" -y $OUTPUT_PATH`)
 * @param variables - Object mapping variable names to their values (e.g., { MEDIA_1: '/path/file.mp3', OUTPUT_PATH: '/out.mp3' })
 * @returns Array of arguments ready for spawn()
 */
export function replaceEnv(cmd: string, variables: typeof process.env): string {
  // 1. Replace placeholders
  let resolved = cmd;
  for (const [key, value] of Object.entries(variables)) {
    // Replace $KEY with value (respecting word boundaries)
    resolved = resolved.replace(
      new RegExp(`\\$${key}\\b`, 'g'),
      value as string,
    );
  }
  return resolved;
}
