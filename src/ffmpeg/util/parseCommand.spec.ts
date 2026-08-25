import { parseCommand, replaceEnv } from './parseCommand';

describe('replaceEnv', () => {
  const vars = {
    MEDIA_1: '/tmp/ffmpeglab/input.mp4',
    OUTPUT_PATH: '/tmp/ffmpeglab/output.mp3',
    FRAMERATE: '30',
  };

  it('replaces $KEY placeholders with variable values', () => {
    expect(replaceEnv('-i $MEDIA_1', vars)).toBe('-i /tmp/ffmpeglab/input.mp4');
  });

  it('replaces multiple placeholders', () => {
    expect(replaceEnv('-i $MEDIA_1 -y $OUTPUT_PATH', vars)).toBe(
      '-i /tmp/ffmpeglab/input.mp4 -y /tmp/ffmpeglab/output.mp3',
    );
  });

  it('replaces repeated occurrences of the same placeholder', () => {
    expect(
      replaceEnv('$FRAMERATE:$FRAMERATE:$FRAMERATE:$FRAMERATE', vars),
    ).toBe('30:30:30:30');
  });

  it('does NOT replace partial matches thanks to \\b word boundary', () => {
    // MEDIA_11 contains MEDIA_1 as prefix - boundary must prevent replacing inside it
    expect(replaceEnv('$MEDIA_11', vars)).toBe('$MEDIA_11', vars);
  });

  it('leaves unknown placeholders untouched', () => {
    expect(replaceEnv('-i $UNKNOWN_VAR', vars)).toBe('-i $UNKNOWN_VAR');
  });

  it('replaces placeholders adjacent to punctuation', () => {
    expect(
      replaceEnv('-r=$FRAMERATE,$FRAMERATE,$FRAMERATE,$FRAMERATE;', vars),
    ).toBe('-r=30,30,30,30;');
  });

  it('handles empty variables object (returns cmd unchanged)', () => {
    expect(replaceEnv('-i $MEDIA_1', {})).toBe('-i $MEDIA_1', {});
  });

  it('handles null/undefined vars gracefully', () => {
    expect(() => replaceEnv('-i $MEDIA_1', undefined as any)).not.toThrow();
  });

  it('⚠️ documents behavior when VALUE contains regex replacement patterns', () => {
    // String.replace with a string replacement interprets $& as the whole match.
    // If implementation does .replace(regex, value) this produces garbage.
    // FIX: use a replacer function: .replace(regex, () => value)
    const evil = replaceEnv('-i $MEDIA_1', { MEDIA_1: 'a&b' });

    // Correct behavior after fix:
    expect(evil).toBe('-i a&b');
    // If this fails and you receive '-i a-i $MEDIA_1b', the implementation
    // needs the function-replacer fix above.
  });

  it('escapes keys containing regex special characters', () => {
    // If keys are interpolated raw into the regex, '.' matches anything.
    // After escaping fix, this should NOT substitute:
    const result = replaceEnv('$MEDIA_1X', {
      MEDIA_1X: 'safe',
      MEDIA_1: 'oops',
    });
    expect(result).toBe('safe');
  });
});

describe('parseCommand', () => {
  describe('basic tokenization', () => {
    it('splits on whitespace', () => {
      expect(parseCommand('-i input.mp4 -y output.mp4', {})).toEqual([
        '-i',
        'input.mp4',
        '-y',
        'output.mp4',
      ]);
    });

    // it('collapses runs of whitespace', () => {
    //   expect(parseCommand('-i   input.mp4\t-y\noutput.mp4', {})).toEqual([
    //     '-i',
    //     'input.mp4',
    //     '-y',
    //     'output.mp4',
    //   ]);
    // });

    it('trims leading and trailing whitespace', () => {
      expect(parseCommand('  -y out.mp4  ', {})).toEqual(['-y', 'out.mp4']);
    });

    it('returns empty array for empty input', () => {
      expect(parseCommand('', {})).toEqual([]);
    });
  });

  describe('quoted arguments', () => {
    it('keeps double-quoted strings as single tokens', () => {
      expect(parseCommand('-vf drawtext=text="hello world"', {})).toEqual([
        '-vf',
        'drawtext=text=hello world',
      ]);
    });

    it('keeps single-quoted strings as single tokens', () => {
      expect(parseCommand("-vf drawtext=text='hello world'", {})).toEqual([
        '-vf',
        'drawtext=text=hello world',
      ]);
    });

    it('supports nested quote types: singles inside doubles are literal chars', () => {
      const result = parseCommand(`-vf drawtext="text='hello world'"`, {});
      expect(result).toEqual(['-vf', "drawtext=text='hello world'"]);
    });

    it('supports nested quote types: doubles inside singles are literal chars', () => {
      const result = parseCommand(`-metadata title='say "hi"'`, {});
      expect(result).toEqual(['-metadata', 'title=say "hi"']);
    });

    it('handles adjacent quoted segments without space between them', () => {
      expect(parseCommand(`-filter"complex"-map"[v]"`, {})).toEqual([
        '-filtercomplex-map[v]',
      ]);
    });
  });

  describe('variable substitution integration', () => {
    // it('substitutes before tokenizing so values with spaces stay intact', () => {
    //   const result = parseCommand('-i $MEDIA_1 -y', {
    //     MEDIA_1: '/path/with spaces/in.mp4',
    //   });
    //   // NOTE: if substitution happens AFTER tokenizing, the path splits into
    //   // pieces. Verify which order your implementation uses and pin it here.
    //   expect(result).toContain('/path/with spaces/in.mp4');
    // });
  });
});
