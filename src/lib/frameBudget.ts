/* Is the 3D pitch too slow on this device? The stage reports the time between frames it draws; once
 * there are enough of them, a median slower than SLOW_FRAME_MS (under 20 frames a second) means the
 * phone is struggling, and the app switches to the 2D pitch for this visit (see pitchView.ts).
 * The first few frames are skipped: they include shader compiling and texture uploads, which are slow
 * everywhere. The latest figures are kept for "Report a problem", so a friend's report carries real
 * numbers from a real phone (they have never been measured on one). Pure apart from that one record. */

export const WARMUP_FRAMES = 5;
export const SAMPLE_FRAMES = 30;
export const SLOW_FRAME_MS = 50;
/** Gaps longer than this are pauses (a tab switch, a dropped animation), not slow frames. */
export const MAX_GAP_MS = 1000;

export type FrameStats = { frames: number; medianMs: number; slow: boolean };

let latest: FrameStats | null = null;
/** The last verdict on this page, for the problem report; null before 3D has drawn enough frames. */
export const latestFrameStats = () => latest;

export class FrameBudget {
  private seen = 0;
  private samples: number[] = [];
  private done = false;

  /** One gap between drawn frames. Returns the verdict the first time there is one, else null. */
  record(gapMs: number): FrameStats | null {
    if (this.done || !(gapMs > 0) || gapMs > MAX_GAP_MS) return null;
    this.seen += 1;
    if (this.seen <= WARMUP_FRAMES) return null;
    this.samples.push(gapMs);
    if (this.samples.length < SAMPLE_FRAMES) return null;
    this.done = true;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const medianMs = sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2;
    latest = { frames: sorted.length, medianMs: Math.round(medianMs * 10) / 10, slow: medianMs > SLOW_FRAME_MS };
    return latest;
  }
}
