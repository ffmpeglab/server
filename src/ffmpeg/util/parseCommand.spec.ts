import { parseCommand } from './parseCommand';

describe('basic tokenization', () => {
  it('splits on whitespace', () => {
    expect(parseCommand('-i input.mp4 -y output.mp4')).toEqual([
      '-i',
      'input.mp4',
      '-y',
      'output.mp4',
    ]);
  });

  it('trims leading and trailing whitespace', () => {
    expect(parseCommand('  -y out.mp4  ')).toEqual(['-y', 'out.mp4']);
  });

  it('returns empty array for empty input', () => {
    expect(parseCommand('')).toEqual([]);
  });

  it('returns empty array for whitespace-only input', () => {
    expect(parseCommand('   ')).toEqual([]);
  });
});

describe('quoted arguments', () => {
  it('keeps double-quoted strings as single tokens', () => {
    expect(parseCommand('-vf drawtext=text="hello world"')).toEqual([
      '-vf',
      'drawtext=text=hello world',
    ]);
  });

  it('keeps single-quoted strings as single tokens', () => {
    expect(parseCommand("-vf drawtext=text='hello world'")).toEqual([
      '-vf',
      'drawtext=text=hello world',
    ]);
  });

  it('supports nested quote types: singles inside doubles are literal chars', () => {
    const result = parseCommand(`-vf drawtext="text='hello world'"`);
    expect(result).toEqual(['-vf', "drawtext=text='hello world'"]);
  });

  it('supports nested quote types: doubles inside singles are literal chars', () => {
    const result = parseCommand(`-metadata title='say "hi"'`);
    expect(result).toEqual(['-metadata', 'title=say "hi"']);
  });

  it('handles adjacent quoted segments without space between them', () => {
    expect(parseCommand(`-filter"complex"-map"[v]"`)).toEqual([
      '-filtercomplex-map[v]',
    ]);
  });
});
