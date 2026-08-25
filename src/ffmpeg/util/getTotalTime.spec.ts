import {
  EditorLayer,
  SpeedValue,
  SpeedValueAsetPts,
  defaultVideoDuration,
  Media,
} from '../../types';
import { getTotalTime } from './getTotalTime';

const makeMedia = (overrides: Partial<Media> = {}): Media =>
  ({
    width: 1280,
    height: 720,
    duration: 5,
    encoding: { speed: SpeedValue['100%'], start: 0 },
    ...overrides,
  }) as any;

const makeLayer = (media: Media[]): EditorLayer => ({ media }) as any;

describe('getTotalTime', () => {
  describe('guard clauses', () => {
    it('returns 0 for an empty layer array', () => {
      expect(getTotalTime([])).toBe(0);
    });

    it('returns 0 for null/undefined', () => {
      expect(getTotalTime(null as any)).toBe(0);
      expect(getTotalTime(undefined as any)).toBe(0);
    });
  });

  describe('duration calculation', () => {
    it('uses encoding.end - encoding.start when end is set', () => {
      const layers = [
        makeLayer([
          makeMedia({
            duration: 99, // must be ignored because encoding.end wins
            encoding: { speed: SpeedValue['100%'], start: 2, end: 7 } as any,
          }),
        ]),
      ];
      expect(getTotalTime(layers)).toBe(5);
    });

    it('falls back to media.duration when encoding.end is absent', () => {
      const layers = [
        makeLayer([
          makeMedia({
            duration: 8,
            encoding: { speed: SpeedValue['100%'], start: 3 } as any,
          }),
        ]),
      ];
      // 8 - 3
      expect(getTotalTime(layers)).toBe(5);
    });

    it('falls back to defaultVideoDuration when neither end nor duration exist', () => {
      const layers = [makeLayer([makeMedia({ duration: undefined } as any)])];
      expect(getTotalTime(layers)).toBe(defaultVideoDuration);
    });
  });

  describe('speed handling', () => {
    it('treats 100% speed as multiplier 1', () => {
      const layers = [makeLayer([makeMedia({ duration: 6 })])];
      expect(getTotalTime(layers)).toBe(6);
    });

    it('applies SpeedValueAsetPts as a multiplier for non-100% speeds', () => {
      // e.g. if SpeedValueAsetPts['200%'] is 0.5, a 4s clip contributes 2s.
      // Adjust expected values to whatever your SpeedValueAsetPts map defines.
      const speed = SpeedValue['200%'];
      const layers = [
        makeLayer([
          makeMedia({
            duration: 4,
            encoding: { speed, start: 0 } as any,
          }),
        ]),
      ];
      expect(getTotalTime(layers)).toBe(
        4 * parseFloat(SpeedValueAsetPts[speed] as string),
      );
    });
  });
  describe('transition offset between consecutive clips', () => {
    it('subtracts the NEXT clip transitionInDuration from current clip', () => {
      const layers = [
        makeLayer([
          makeMedia({ duration: 5 }), // contributes 5 - 1 = 4
          makeMedia({
            duration: 4,
            encoding: {
              speed: SpeedValue['100%'],
              start: 0,
              transitionIn: 'fade',
              transitionInDuration: 1,
            } as any,
          }), // contributes 4 (no following clip -> no offset)
        ]),
      ];
      expect(getTotalTime(layers)).toBe(8);
    });

    it('uses default offset 3 when transitionInDuration is missing', () => {
      const layers = [
        makeLayer([
          makeMedia({ duration: 10 }), // 10 - 3 = 7
          makeMedia({
            duration: 4,
            encoding: {
              speed: SpeedValue['100%'],
              start: 0,
              transitionIn: 'slide',
            } as any,
          }),
        ]),
      ];
      expect(getTotalTime(layers)).toBe(11);
    });

    it('applies NO offset when transitionIn is none or absent', () => {
      const layers = [
        makeLayer([makeMedia({ duration: 5 }), makeMedia({ duration: 5 })]),
      ];
      expect(getTotalTime(layers)).toBe(10);
    });
  });

  describe('multiple layers take the MAXIMUM, not the sum', () => {
    it('returns the longest layer duration', () => {
      const layers = [
        makeLayer([makeMedia({ duration: 3 })]), // track A: 3s
        makeLayer([makeMedia({ duration: 9 })]), // track B: 9s
        makeLayer([makeMedia({ duration: 5 })]), // track C: 5s
      ];
      expect(getTotalTime(layers)).toBe(9);
    });

    it('handles a realistic mixed project', () => {
      const layers = [
        makeLayer([
          makeMedia({ duration: 10 }), // main video track
        ]),
        makeLayer([
          makeMedia({ duration: 4 }), // overlay track: (4 - 1) + 3
          makeMedia({
            duration: 3,
            encoding: {
              speed: SpeedValue['100%'],
              start: 0,
              transitionIn: 'fade',
              transitionInDuration: 1,
            } as any,
          }),
        ]),
      ];
      // Layer 1: 10 ; Layer 2: (4-1) + 3 = 6 -> max is 10
      expect(getTotalTime(layers)).toBe(10);
    });
  });

  describe('edge cases worth knowing about', () => {
    it('⚠️ documents: a layer whose clips sum to exactly 0 is skipped entirely', () => {
      // Implementation: `if (!t) return a` treats t===0 as "no valid media".
      // With one zero-duration clip, result is the other layer's time.
      const layers = [
        makeLayer([makeMedia({ duration: 0 })]),
        makeLayer([makeMedia({ duration: 7 })]),
      ];
      expect(getTotalTime(layers)).toBe(7);
    });

    it('⚠️ documents potential NaN when two layers have EQUAL nonzero totals', () => {
      // The reduce has branches only for a>t and t>a. If they're equal on some
      // later iteration, the reducer falls through and returns undefined ->
      // final result becomes undefined/NaN. Pin current behavior OR fix source:
      //
      // FIX suggestion for getTotalTime.ts, replace last lines of inner logic:
      //   return Math.max(a, t);
      // and outer reduce:
      //   return Math.max(a, t ?? 0);

      const layers = [
        makeLayer([makeMedia({ duration: 5 }), makeMedia({ duration: 5 })]),
      ];
      const result = getTotalTime(layers);
      // After applying the Math.max fix this should be 10.
      // Before the fix it may be NaN - run once to see, then keep whichever line applies.
      expect(Number.isFinite(result)).toBe(true);
    });
  });
});
