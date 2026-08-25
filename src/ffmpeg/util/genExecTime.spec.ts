import { genExecTime, execToMilliseconds } from './genExecTime';

describe('genExecTime', () => {
  describe('basic formatting (HH:MM:SS)', () => {
    it('formats zero as 00:00:00', () => {
      expect(genExecTime(0)).toBe('00:00:00');
    });

    it('formats sub-second durations', () => {
      expect(genExecTime(0.5)).toBe('00:00:00'); // floor of 500ms
      expect(genExecTime(0.999)).toBe('00:00:00');
    });

    it('formats whole seconds', () => {
      expect(genExecTime(1)).toBe('00:00:01');
      expect(genExecTime(9)).toBe('00:00:09');
      expect(genExecTime(10)).toBe('00:00:10');
      expect(genExecTime(59)).toBe('00:00:59');
    });

    it('rolls into minutes', () => {
      expect(genExecTime(60)).toBe('00:01:00');
      expect(genExecTime(61)).toBe('00:01:01');
      expect(genExecTime(599)).toBe('00:09:59');
      expect(genExecTime(600)).toBe('00:10:00');
    });

    it('rolls into hours', () => {
      expect(genExecTime(3600)).toBe('01:00:00');
      expect(genExecTime(3661)).toBe('01:01:01');
      expect(genExecTime(7200)).toBe('02:00:00');
    });

    it('pads all components to two digits', () => {
      // 1h 2m 3s = 3723s
      expect(genExecTime(3723)).toBe('01:02:03');
    });
  });

  describe('fractional inputs', () => {
    it('truncates fractional seconds (no rounding)', () => {
      expect(genExecTime(1.7)).toBe('00:00:01'); // floor, not round to :02
      expect(genExecTime(59.9)).toBe('00:00:59');
      expect(genExecTime(119.999)).toBe('00:01:59');
    });

    it('handles float imprecision gracefully', () => {
      expect(genExecTime(0.1 + 0.2)).toBe('00:00:00');
    });
  });

  describe('⚠️ the %24 hour cap', () => {
    it('wraps durations >= 24 hours back around', () => {
      // Math.floor(... % 24) → 25h renders as "01:..."
      expect(genExecTime(25 * 3600)).toBe('01:00:00');
      expect(genExecTime(48 * 3600)).toBe('00:00:00');
      expect(genExecTime(49 * 3600)).toBe('01:00:00');
    });

    it('documents that long renders silently lose day information ⚠️', () => {
      const result = genExecTime(100 * 3600); // 100 hours
      expect(result).not.toBe('100:00:00');
      expect(result).toBe('04:00:00'); // 100 % 24
    });
  });

  describe('NaN handling', () => {
    it('returns 00:00:00 for NaN input', () => {
      expect(genExecTime(NaN)).toBe('00:00:00');
    });

    it('returns 00:00:00 for undefined', () => {
      expect(genExecTime(undefined as any)).toBe('00:00:00');
    });

    it('returns 00:00:00 for non-numeric strings', () => {
      expect(genExecTime('abc' as any)).toBe('00:00:00');
    });
  });

  it('is the exact inverse of execToMilliseconds for valid values', () => {
    for (const s of [0, 1, 59, 61, 3600, 3661.5]) {
      const formatted = genExecTime(s);
      // note: fractional part is lost through formatting — compare floored
      expect(execToMilliseconds(formatted)).toBe(Math.floor(s));
    }
  });
});

describe('execToMilliseconds', () => {
  it('⚠️ returns SECONDS despite its name — not milliseconds!', () => {
    // This is the critical finding: callers doing `* 1000000` assume ms.
    // The function actually returns plain seconds.
    expect(execToMilliseconds('00:00:30')).toBe(30); // NOT 30000
    expect(execToMilliseconds('00:01:00')).toBe(60); // NOT 60000
    expect(execToMilliseconds('01:00:00')).toBe(3600); // NOT 3600000
  });

  it('parses each component correctly', () => {
    expect(execToMilliseconds('00:00:00')).toBe(0);
    expect(execToMilliseconds('00:00:01')).toBe(1);
    expect(execToMilliseconds('00:05:30')).toBe(330); // 5*60 + 30
    expect(execToMilliseconds('02:10:15')).toBe(7815); // 7200+600+15
  });

  it('handles fractional seconds via parseFloat', () => {
    expect(execToMilliseconds('00:00:01.500')).toBeCloseTo(1.5);
    expect(execToMilliseconds('00:10:23.456')).toBeCloseTo(623.456);
  });

  it('handles FFmpeg time formats with milliseconds', () => {
    // typical stderr line: time=00:00:12.34
    expect(execToMilliseconds('00:00:12.34')).toBeCloseTo(12.34);
  });

  describe('malformed inputs (relevant given the createFFmpeg N/A crash risk)', () => {
    it('returns NaN for "N/A"', () => {
      // split(':') on 'N/A' → ['N/A'], parseInt→NaN, parseFloat(undefined)→NaN
      const result = execToMilliseconds('N/A');
      expect(Number.isNaN(result)).toBe(true);
    });

    it('returns NaN for empty string', () => {
      expect(Number.isNaN(execToMilliseconds(''))).toBe(true);
    });

    it('returns NaN for missing components ("01:")', () => {
      expect(Number.isNaN(execToMilliseconds('01:'))).toBe(true);
    });

    it('treats missing seconds segment as NaN (undefined index)', () => {
      // '00:01' → seconds = parseFloat(undefined) → NaN poisons whole sum
      expect(Number.isNaN(execToMilliseconds('00:01'))).toBe(true);
    });
  });
});
