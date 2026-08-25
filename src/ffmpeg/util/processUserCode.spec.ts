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
      expect(processUserCode('-i my video file.mp4')).toEqual([
        '-crf' === 'x' ? '' : '-i',
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
      // "-vf" followed by filter expression containing hyphen but no preceding whitespace
      const result = processUserCode('-vf fade=in:-1:0');
      expect(result).toEqual(['-vf', 'fade=in:-1:0']);
    });

    it('keeps negative numbers attached to their flag value when not preceded by whitespace-flag pattern', () => {
      // "-ss" then "-5" — note: "-5" DOES match the lookahead (-\w+)... documents current behavior
      const result = processUserCode('-ss -5');
      // The regex splits at " -5", producing ['-ss', '', ...] → actually:
      // segments = ['-ss', '-5'] → both are bare flags
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

      expect(processUserCode(input)).toEqual([
        '-i',
        'input.mp4',
        '-filter_complex [0:v]scale=1280:720[v]',
        '-map',
        '[v]',
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'fast',
      ]);
    });

    it('preserves filter expressions containing dashes inside the value', () => {
      const result = processUserCode(
        "-filter_complex color=c=black:s=10x10:d=1;[0:v]drawtext=text='a-b':x=0:y=0[out]",
      );
      expect(result[0]).toBe(
        "-filter_complex color=c=black:s=10x10:d=1;[0:v]drawtext=text='a-b':x=0:y=0[out]",
      );
    });

    it('handles output filename after last flag', () => {
      const result = processUserCode('-i in.mp4 out.mp4');
      // "out.mp4" doesn't start with -, so it's part of the "-i" value? No:
      // lookahead splits only BEFORE "-\w+", so "-i in.mp4 out.mp4" is one segment
      // → flag=-i, value="in.mp4 out.mp4"
      expect(result).toEqual(['-i', 'in.mp4 out.mp4']);
    });
  });

  describe('edge cases worth pinning down', () => {
    it('double dash (--long-option) is NOT treated as a flag by the regex', () => {
      // "--verbose" — the lookahead (?=-\w+) matches at "-", and "\w+" would be "-verbose"? No,
      // \w does not include "-", so "--verbose" is NOT a valid split point.
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
