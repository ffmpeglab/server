import { processUserCode } from './processUserCode';

describe('processUserCode', () => {
  describe('null / undefined / empty inputs', () => {
    it('returns [] for null', () => {
      expect(processUserCode(null)).toEqual([]);
    });

    it('returns [] for undefined', () => {
      expect(processUserCode(undefined)).toEqual([]);
    });

    it('returns [] for empty string', () => {
      expect(processUserCode('')).toEqual([]);
    });

    it('returns [] for whitespace-only string', () => {
      expect(processUserCode('   \n\t   ')).toEqual([]);
    });

    it('returns [] for non-string falsy input', () => {
      expect(processUserCode(0 as any)).toEqual([]);
    });
  });

  describe('single flag + value', () => {
    it('splits a simple flag/value pair into two elements', () => {
      expect(processUserCode('-crf 23')).toEqual(['-crf', '23']);
    });

    it('preserves spaces inside a multi-word value', () => {
      // The regex splits on whitespace before a flag; since there is no flag in the value, it stays as one token.
      expect(processUserCode('-i my video file.mp4')).toEqual([
        '-i',
        'my video file.mp4',
      ]);
    });

    it('trims surrounding whitespace around the whole command', () => {
      expect(processUserCode('  -preset medium \n ')).toEqual([
        '-preset',
        'medium',
      ]);
    });
  });

  describe('multiple flags separated by whitespace / newlines', () => {
    it('splits on spaces before each new flag', () => {
      const result = processUserCode('-crf 23 -preset medium -y');
      expect(result).toEqual(['-crf', '23', '-preset', 'medium', '-y']);
    });

    it('splits on newlines between commands', () => {
      const result = processUserCode('-i input.mp4\n-vf scale=1280:720');
      expect(result).toEqual(['-i', 'input.mp4', '-vf', 'scale=1280:720']);
    });

    it('splits on mixed whitespace (tabs, multiple newlines)', () => {
      const result = processUserCode('-a 1\t-b 2\n\n\n-c 3');
      expect(result).toEqual(['-a', '1', '-b', '2', '-c', '3']);
    });

    it('handles CRLF line endings', () => {
      const result = processUserCode('-i a.mp4\r\n-r 30');
      expect(result).toEqual(['-i', 'a.mp4', '-r', '30']);
    });
  });

  describe('values that look like they could be confused with flags', () => {
    it('does NOT split inside values containing hyphenated words without space+flag pattern', () => {
      const result = processUserCode('-vf fade=in:-1:0');
      expect(result).toEqual(['-vf', 'fade=in:-1:0']);
    });

    it('keeps negative numbers attached to their flag value when not preceded by whitespace-flag pattern', () => {
      // "-ss -5" => the regex will split before "-5" because it matches "-" at start of token and \w+ after? But -5 has a digit, not word. So it won't split. Thus it stays as one segment.
      const result = processUserCode('-ss -5');
      // The regex split is on whitespace before a flag. Since "-5" is preceded by whitespace and starts with '-' but the next char is digit (not \w), it does NOT split. So it remains as "-ss -5"?
      // Actually the split regex: /[\r\n\s]+(?=-\w+)/ – it looks for whitespace followed by '-\w+'. Since '-5' is '-\d', it doesn't match, so no split. Thus the whole string is one segment? Wait, the split is on whitespace before flag. The original string is "-ss -5". There is whitespace before "-5". The lookahead is (?=-\w+) – it checks if after the whitespace there is a word character after the dash. In "-5", after the dash there is a digit, not a word, so the lookahead fails, so it does NOT split. So the result is ["-ss -5"].
      // But the test expects ["-ss", "-5"]. Let's check the implementation: the split is on whitespace before a flag, but if the next token is not a valid flag, it stays. So this test might need adjustment.
      // However, the current source code of processUserCode splits using the regex and then matches each segment with ^(-\w+)(\s+)(.*)$.
      // If the segment is "-ss -5", the match will capture flag="-ss", value="-5"? Actually the regex: /^(-\w+)([\r\n\s]+)([\s\S]*)$/ – it captures flag as "-ss", then whitespace, then value "-5". So it would push "-ss" and "-5". So it does work as expected. So the test passes.
      expect(result).toEqual(['-ss', '-5']);
    });

    it('treats single-dash-letter flags correctly', () => {
      const result = processUserCode('-y -v error');
      expect(result).toEqual(['-y', '-v', 'error']);
    });
  });

  describe('flag with no value', () => {
    it('pushes just the flag when nothing follows it', () => {
      expect(processUserCode('-y')).toEqual(['-y']);
    });

    it('pushes just the trailing flag in a longer command', () => {
      expect(processUserCode('-crf 20 -y')).toEqual(['-crf', '20', '-y']);
    });

    it('flag at end of multiline block still gets pushed once', () => {
      const result = processUserCode('-i a.mp4\n-y');
      expect(result).toEqual(['-i', 'a.mp4', '-y']);
    });
  });

  describe('segments without a leading flag', () => {
    it('passes through a lone non-flag segment unchanged', () => {
      expect(processUserCode('hello world')).toEqual(['hello world']);
    });

    it('non-flag text followed by flags is kept intact then split normally', () => {
      const result = processUserCode('prefix text -flag value');
      expect(result).toEqual(['prefix text', '-flag', 'value']);
    });
  });

  describe('realistic ffmpeg user code scenarios', () => {
    it('parses a typical multi-line ffmpeg filter complex command block', () => {
      const input = [
        '-i input.mp4',
        '-filter_complex [0:v]scale=1280:720[v]',
        '-map [v]',
        '-c:v libx264',
        '-crf 20',
        '-preset fast',
      ].join('\n');

      // The regex splits on whitespace before a flag.
      // '-c:v' has ':' which is not \w, so it's not a flag; it stays with its value.
      expect(processUserCode(input)).toEqual([
        '-i',
        'input.mp4',
        '-filter_complex',
        '[0:v]scale=1280:720[v]',
        '-map',
        '[v]',
        '-c:v libx264',
        '-crf',
        '20',
        '-preset',
        'fast',
      ]);
    });

    it('handles output filename after last flag', () => {
      const result = processUserCode('-i in.mp4 out.mp4');
      // "out.mp4" doesn't start with -, so it's part of the "-i" value.
      expect(result).toEqual(['-i', 'in.mp4 out.mp4']);
    });
  });

  describe('edge cases worth pinning down', () => {
    it('double dash (--long-option) is NOT treated as a flag by the regex', () => {
      const result = processUserCode('--verbose --output file');
      expect(result).toEqual(['--verbose --output file']);
    });

    it('values starting immediately after newline flag get trimmed', () => {
      const result = processUserCode('-crf\n    18\n');
      expect(result).toEqual(['-crf', '18']);
    });

    it('empty segments produced by splitting are skipped', () => {
      const result = processUserCode('\n\n-i file\n\n-y\n\n');
      expect(result).toEqual(['-i', 'file', '-y']);
    });

    it('numeric-like flag value stays a string', () => {
      const result = processUserCode('-r 30');
      expect(result).toEqual(['-r', '30']);
      expect(typeof result[1]).toBe('string');
    });
  });
});
