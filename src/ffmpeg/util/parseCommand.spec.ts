import { parseCommand, replaceEnv, processUserCode } from './parseCommand';

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
    expect(replaceEnv('$MEDIA_11', vars)).toBe('$MEDIA_11');
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
    expect(replaceEnv('-i $MEDIA_1', {})).toBe('-i $MEDIA_1');
  });

  it('handles null/undefined vars gracefully', () => {
    expect(() => replaceEnv('-i $MEDIA_1', undefined as any)).not.toThrow();
  });

  it('handles values containing regex replacement patterns', () => {
    const evil = replaceEnv('-i $MEDIA_1', { MEDIA_1: 'a&b' });
    expect(evil).toBe('-i a&b');
  });

  it('does not substitute variables whose keys are substrings of longer keys', () => {
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

    it('trims leading and trailing whitespace', () => {
      expect(parseCommand('  -y out.mp4  ', {})).toEqual(['-y', 'out.mp4']);
    });

    it('returns empty array for empty input', () => {
      expect(parseCommand('', {})).toEqual([]);
    });

    it('returns empty array for whitespace-only input', () => {
      expect(parseCommand('   ', {})).toEqual([]);
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
    it('substitutes before tokenizing; values with spaces must be quoted in the original command', () => {
      const result = parseCommand('-i "$MEDIA_1" -y', {
        MEDIA_1: '/path/with spaces/in.mp4',
      });
      expect(result).toEqual(['-i', '/path/with spaces/in.mp4', '-y']);
    });

    it('substitutes before tokenizing; unquoted values with spaces are split', () => {
      const result = parseCommand('-i $MEDIA_1 -y', {
        MEDIA_1: '/path/with spaces/in.mp4',
      });
      expect(result).toEqual(['-i', '/path/with', 'spaces/in.mp4', '-y']);
    });
  });

  // 👇 New test for multi-line complex command
  it('parses a multi-line complex FFmpeg command with variables', () => {
    const cmd = `
-i
$MEDIA_1
-crf
25
-filter_complex
[0:v]trim=start=0:end=5.67,setpts=PTS-STARTPTS,setdar=16/9,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,format=rgba,fps=fps=30,settb=expr=1/30,colorchannelmixer=rr=1:gg=1:bb=1:aa=1[v0?];
[v0?]settb=expr=1/30[v_layer0];
[v_layer0]split[v_main][v_overlay];[v_main]settb=expr=1/30,
zoompan=z='min(max(zoom,pzoom)+0.005,2.2)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[v_concat];[v_overlay]nullsink;
aevalsrc=0:d=5.67[s0];[s0]adelay=delays=0|0,volume=1[a0?];
[a0?]amix=inputs=1:duration=longest[a_concat]
-aspect
16/9
-preset
veryfast
-movflags
+faststart
-map
[v_concat]
-map
[a_concat]
-r
30
-ss
00:00:00
-to
00:00:05
-y
$OUTPUT_PATH
`;
    const vars = {
      MEDIA_1: '/path/to/input.mp4',
      OUTPUT_PATH: '/path/to/output.mp4',
    };
    const result = parseCommand(cmd, vars);

    // Check the start
    expect(result.slice(0, 3)).toEqual(['-i', '/path/to/input.mp4', '-crf']);
    expect(result[3]).toBe('25');

    // The -filter_complex flag should be present
    const filterIndex = result.indexOf('-filter_complex');
    expect(filterIndex).toBeGreaterThan(-1);

    // The filter graph is not quoted, so it will be split into multiple tokens.
    // We can check that some key parts appear.
    expect(result.some(token => token.includes('[v0?]'))).toBe(true);
    expect(result.some(token => token.includes('[v_layer0]'))).toBe(true);
    expect(result.some(token => token.includes('[v_concat]'))).toBe(true);
    expect(result.some(token => token.includes('[a_concat]'))).toBe(true);

    // Check -aspect and its value
    const aspectIndex = result.indexOf('-aspect');
    expect(aspectIndex).toBeGreaterThan(-1);
    expect(result[aspectIndex + 1]).toBe('16/9');

    // Check -preset, -movflags, -map, -r, -ss, -to, -y
    expect(result.includes('-preset')).toBe(true);
    expect(result.includes('veryfast')).toBe(true);
    expect(result.includes('-movflags')).toBe(true);
    expect(result.includes('+faststart')).toBe(true);

    const mapIndices = result
      .map((t, i) => t === '-map' ? i : -1)
      .filter(i => i >= 0);
    expect(mapIndices.length).toBe(2);
    expect(result[mapIndices[0] + 1]).toBe('[v_concat]');
    expect(result[mapIndices[1] + 1]).toBe('[a_concat]');

    expect(result.includes('-r')).toBe(true);
    expect(result.includes('30')).toBe(true);
    expect(result.includes('-ss')).toBe(true);
    expect(result.includes('00:00:00')).toBe(true);
    expect(result.includes('-to')).toBe(true);
    expect(result.includes('00:00:05')).toBe(true);
    expect(result.includes('-y')).toBe(true);
    expect(result[result.length - 1]).toBe('/path/to/output.mp4');
  });
});

describe('processUserCode', () => {
  it('returns empty array for null/undefined/empty input', () => {
    expect(processUserCode(null)).toEqual([]);
    expect(processUserCode(undefined)).toEqual([]);
    expect(processUserCode('')).toEqual([]);
    expect(processUserCode('   ')).toEqual([]);
  });

  it('splits on whitespace', () => {
    expect(processUserCode('-i input.mp4 -y output.mp4')).toEqual([
      '-i',
      'input.mp4',
      '-y',
      'output.mp4',
    ]);
  });

  it('handles flags with underscores (e.g., -filter_complex) and preserves quotes', () => {
    const cmd = '-filter_complex "[0:v]trim=...; [v_concat]" -map "[v]" -y out.mp4';
    expect(processUserCode(cmd)).toEqual([
      '-filter_complex',
      '"[0:v]trim=...; [v_concat]"',
      '-map',
      '"[v]"',
      '-y',
      'out.mp4',
    ]);
  });

  it('preserves quoted arguments', () => {
    const cmd = '-vf drawtext="text=hello world" -metadata title="test"';
    expect(processUserCode(cmd)).toEqual([
      '-vf',
      'drawtext="text=hello world"',
      '-metadata',
      'title="test"',
    ]);
  });

  it('preserves single-quoted arguments', () => {
    const cmd = "-vf drawtext='text=hello world'";
    expect(processUserCode(cmd)).toEqual([
      '-vf',
      "drawtext='text=hello world'",
    ]);
  });

  it('pairs each flag with its following non-flag value, preserving quotes', () => {
    const cmd = '-filter_complex "[0:v]scale=..." -map "[v]" -y';
    expect(processUserCode(cmd)).toEqual([
      '-filter_complex',
      '"[0:v]scale=..."',
      '-map',
      '"[v]"',
      '-y',
    ]);
  });

  it('handles flags without values (e.g., -y, -n)', () => {
    const cmd = '-i in.mp4 -y -n out.mp4';
    expect(processUserCode(cmd)).toEqual([
      '-i',
      'in.mp4',
      '-y',
      '-n',
      'out.mp4',
    ]);
  });

  it('handles adjacent quoted segments without spaces', () => {
    const cmd = `-filter"complex"-map"[v]"`;
    expect(processUserCode(cmd)).toEqual(['-filter"complex"-map"[v]"']);
  });

  it('does not treat tokens that start with - but are quoted as flags', () => {
    const cmd = '-i "-input"';
    expect(processUserCode(cmd)).toEqual(['-i', '"-input"']);
  });

  it('handles nested quotes', () => {
    const cmd = `-vf "text='hello world'"`;
    expect(processUserCode(cmd)).toEqual(['-vf', '"text=\'hello world\'"']);
  });

  it('handles multiple spaces and tabs', () => {
    const cmd = '-i   input.mp4\t-y\noutput.mp4';
    expect(processUserCode(cmd)).toEqual([
      '-i',
      'input.mp4',
      '-y',
      'output.mp4',
    ]);
  });

  it('handles complex filter graphs with semicolons and brackets, preserving quotes', () => {
    const cmd = '-filter_complex "[0:v]trim=0:5,scale=1280:720[v0];[1:a]adelay=1000[a1]" -map "[v0]" -map "[a1]"';
    expect(processUserCode(cmd)).toEqual([
      '-filter_complex',
      '"[0:v]trim=0:5,scale=1280:720[v0];[1:a]adelay=1000[a1]"',
      '-map',
      '"[v0]"',
      '-map',
      '"[a1]"',
    ]);
  });
});