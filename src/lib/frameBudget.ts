/* Is the 3D pitch too slow on this device? The stage reports the time between frames it draws. Frames
 * in the first WARMUP_MS after the stage starts are skipped: shader compiling, texture uploads, the page
 * hydrating and players running on make them slow everywhere. After that, frames are judged in windows
 * of SAMPLE_FRAMES; a window whose median is slower than SLOW_FRAME_MS (about 18 frames a second) is
 * slow, and only SLOW_WINDOWS slow windows in a row switch the app to the 2D pitch for this visit (see
 * pitchView.ts), so one busy moment doesn't. The latest figures are kept for "Report a problem", so a
 * friend's report carries real numbers from a real phone (they have never been measured on one).
 * Pure apart from that one record. */

export const WARMUP_MS = 1500;
export const SAMPLE_FRAMES = 30;
export const SLOW_FRAME_MS = 55;
export const SLOW_WINDOWS = 2;
/** Gaps longer than this are pauses (a tab switch, a dropped animation), not slow frames. */
export const MAX_GAP_MS = 1000;

export type FrameStats = { frames: number; medianMs: number; slow: boolean };

let latest: FrameStats | null = null;
/** The last measured window on this page, for the problem report; null before 3D has drawn enough frames. */
export const latestFrameStats = () => latest;
/** Forget the figures (choosing 3D again starts a fresh measurement). */
export const clearFrameStats = () => {
  latest = null;
};

export class FrameBudget {
  private samples: number[] = [];
  private slowWindows = 0;
  private done = false;
  private readonly startedAt: number;

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  /** One gap between drawn frames, ending at time `now` (ms, same clock as `startedAt`).
   * Returns the verdict once SLOW_WINDOWS slow windows run in a row (slow: true), else null. */
  record(gapMs: number, now: number): FrameStats | null {
    if (this.done || !(gapMs > 0) || gapMs > MAX_GAP_MS) return null;
    if (now - this.startedAt < WARMUP_MS) return null;
    this.samples.push(gapMs);
    if (this.samples.length < SAMPLE_FRAMES) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    this.samples = [];
    const mid = sorted.length / 2;
    const medianMs = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    const slow = medianMs > SLOW_FRAME_MS;
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    latest = { frames: sorted.length, medianMs: Math.round(medianMs * 10) / 10, slow: this.slowWindows >= SLOW_WINDOWS };
    if (!latest.slow) return null;
    this.done = true;
    return latest;
  }
}
