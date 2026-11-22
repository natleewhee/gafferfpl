"use client";

import { useSyncExternalStore } from "react";
import { readItem, writeItem } from "./storage";
import { startIn2d } from "./device";
import { clearFrameStats } from "./frameBudget";

/* Whether the Squad pitch is drawn in 3D or as the flat 2D pitch. Remembered on
 * this device. With no choice saved, 3D is the default, except on a device that
 * looks very low-powered (startIn2d). A device that cannot run WebGL, or draws the
 * 3D pitch too slowly (frameBudget.ts), falls back to 2D for that visit without
 * changing the saved choice. */

export type PitchView = "3d" | "2d";
const KEY = "fpl-pitch-view";
const listeners = new Set<() => void>();

function read(): PitchView {
  const saved = readItem(KEY);
  if (saved === "2d" || saved === "3d") return saved;
  return startIn2d(typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } }))
    ? "2d"
    : "3d";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePitchView(): PitchView {
  return useSyncExternalStore(subscribe, read, () => "3d");
}

export function setPitchView(view: PitchView) {
  writeItem(KEY, view);
  if (view === "3d") {
    unavailable3d = null; // choosing 3D again is a retry
    clearFrameStats();
  }
  listeners.forEach((l) => l());
}

/* Whether a 3D pitch fell back to 2D on this device this visit, and why: it couldn't start
 * (no WebGL), or it drew too slowly. Shared, so every pitch shows 2D and the menu can say so;
 * not saved, so the next visit tries again. */
export type Pitch3dFallback = "unavailable" | "slow";
let unavailable3d: Pitch3dFallback | null = null;

export function usePitch3dUnavailable(): boolean {
  return useSyncExternalStore(subscribe, () => unavailable3d !== null, () => false);
}

export function usePitch3dFallback(): Pitch3dFallback | null {
  return useSyncExternalStore(subscribe, () => unavailable3d, () => null);
}

export function markPitch3dUnavailable() {
  if (unavailable3d === "unavailable") return;
  unavailable3d = "unavailable";
  listeners.forEach((l) => l());
}

export function markPitch3dSlow() {
  if (unavailable3d) return;
  unavailable3d = "slow";
  listeners.forEach((l) => l());
}

/** The view a pitch actually shows: the saved choice, or 2D when 3D can't start (or keep up) here. */
export function readShownPitchView(): PitchView {
  return unavailable3d ? "2d" : read();
}

export function useShownPitchView(): PitchView {
  return useSyncExternalStore(subscribe, readShownPitchView, () => "3d");
}


/* Whether the ball goes round the 3D pitch while nobody is selected. On by default, and
 * remembered on this device: it keeps a screen drawing, so it is there to switch off. */
const AMBIENT_KEY = "fpl-pitch-passing";

function readAmbient(): boolean {
  return readItem(AMBIENT_KEY) !== "off";
}

export function usePitchAmbient(): boolean {
  return useSyncExternalStore(subscribe, readAmbient, () => true);
}

export function setPitchAmbient(on: boolean) {
  writeItem(AMBIENT_KEY, on ? "on" : "off");
  listeners.forEach((l) => l());
}

/** Whether this device asks for less motion (then the ball does not go round, so its switch is not shown). */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      try {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        mq.addEventListener("change", cb);
        return () => mq.removeEventListener("change", cb);
      } catch {
        return () => {};
      }
    },
    () => {
      try {
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        return false;
      }
    },
    () => false,
  );
}
