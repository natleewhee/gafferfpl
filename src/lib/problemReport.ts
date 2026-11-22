/* "Report a problem": the details someone needs to reproduce what a friend saw,
 * as plain text they copy and paste to whoever sent them the app (Nat asked for
 * clipboard over a GitHub issue or email, 22 Nov). Pure, so it is unit-tested;
 * the caller reads the browser bits and passes them in. Nothing is sent
 * anywhere: it only lands on the friend's own clipboard. */

export type ReportContext = {
  teamId: string;
  /** "Team · Now", "Scenarios", ... -- whatever was on screen. */
  view: string;
  targetGameweek?: number | null;
  basedOnGameweek?: number | null;
  /** When the forecast on screen was built (ISO). */
  forecastBuiltAt?: string | null;
  build?: string | null;
  url: string;
  userAgent: string;
  viewport: { width: number; height: number; dpr: number };
  pitch?: string | null;
  now: Date;
};

/** Keeps the report short: the browser and OS names, not the whole UA string. */
export function shortDevice(userAgent: string): string {
  const os = /Android [\d.]+/.exec(userAgent)?.[0] ?? /iPhone OS [\d_]+/.exec(userAgent)?.[0]?.replace(/_/g, ".") ??
    /Mac OS X [\d_]+/.exec(userAgent)?.[0]?.replace(/_/g, ".") ?? /Windows NT [\d.]+/.exec(userAgent)?.[0] ?? "unknown OS";
  const browser = /(?:CriOS|Chrome)\/\d+/.exec(userAgent)?.[0] ?? /Firefox\/\d+/.exec(userAgent)?.[0] ??
    /Version\/[\d.]+ (?:Mobile\/\S+ )?Safari/.exec(userAgent)?.[0]?.replace(/ Mobile\/\S+/, "") ?? "unknown browser";
  return `${os}, ${browser}`;
}

export function problemReport(c: ReportContext, note = ""): string {
  const gw = c.targetGameweek ? `GW${c.targetGameweek}${c.basedOnGameweek ? ` (from GW${c.basedOnGameweek} squad)` : ""}` : "no forecast loaded";
  const lines = [
    "GafferFPL problem report",
    note.trim() ? `What happened: ${note.trim()}` : "What happened: (write it here)",
    "",
    `Team ID: ${c.teamId || "none"}`,
    `Screen: ${c.view}`,
    `Forecast: ${gw}${c.forecastBuiltAt ? `, built ${c.forecastBuiltAt}` : ""}`,
    `Build: ${c.build ?? "unknown"}`,
    `Device: ${shortDevice(c.userAgent)}, ${c.viewport.width}x${c.viewport.height} @${c.viewport.dpr}x${c.pitch ? `, pitch ${c.pitch}` : ""}`,
    `Time: ${c.now.toISOString()}`,
    `Page: ${c.url}`,
  ];
  return lines.join("\n");
}
