import type { PendingTransfer } from "./transfers";

/* The browser side of /api/transfers, shared by the "Make a transfer" form and
 * the replace-on-the-pitch sheet. */

export type Rebuild = "started" | "running" | "scheduled" | "none";

export const REBUILD_TEXT: Record<Rebuild, string> = {
  started: "Rebuilding the forecast now — refresh in about 5 minutes to see your updated squad.",
  running: "A rebuild is already running. Refresh in a few minutes to see your updated squad.",
  scheduled: "Your squad updates at the next daily rebuild (03:00 UTC, 11:00 SGT).",
  none: "",
};

export type TransferResult = {
  transfers: PendingTransfer[];
  rebuild: Rebuild;
  /** Why a rebuild could not start, when it could not. */
  rebuildHint?: string;
  duplicate: boolean;
};

/** Fetches an owner-only route. If the server says editing is locked, asks
 * for the owner key once, unlocks this browser and retries. */
async function ownerFetch(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status !== 401) return res;
  const locked = await res.clone().json().then((j) => Boolean(j?.locked)).catch(() => false);
  if (!locked) return res;
  const secret = typeof window !== "undefined" ? window.prompt("Owner key to unlock editing:") : null;
  if (!secret) return res;
  const unlock = await fetch("/api/owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secret }),
  });
  return unlock.ok ? fetch(url, init) : unlock;
}

async function call(method: "POST" | "DELETE", body: unknown): Promise<TransferResult> {
  const res = await ownerFetch("/api/transfers", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || (method === "POST" ? "Failed to save" : "Failed to remove"));
  askRebuildCheck();
  return {
    transfers: json.overrides?.transfers ?? [],
    rebuild: json.rebuild ?? "scheduled",
    rebuildHint: json.rebuildHint,
    duplicate: Boolean(json.duplicate),
  };
}

export const saveTransfer = (outId: number, inId: number, basedOnGw: number, note = "", cutoff: string | null = null) =>
  call("POST", { outId, inId, basedOnGw, note, cutoff });

export const removeTransfer = (outId: number, inId: number) => call("DELETE", { outId, inId });

/** The "Rebuild now" button's call. */
export async function rebuildNow(): Promise<{ rebuild: Rebuild; hint?: string }> {
  const res = await ownerFetch("/api/rebuild", { method: "POST" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Couldn't start a rebuild");
  askRebuildCheck();
  return { rebuild: json.rebuild ?? "scheduled", hint: json.hint };
}

/** Where the latest rebuild is (owner only; no key prompt: a locked browser just gets null). */
export async function rebuildStatus(): Promise<import("./transferStatus").RebuildRun | null> {
  try {
    const res = await fetch("/api/rebuild", { cache: "no-store" });
    if (!res.ok) return null;
    return ((await res.json()) as { run?: import("./transferStatus").RebuildRun | null }).run ?? null;
  } catch {
    return null;
  }
}

/** Saving or removing a transfer tells the status row to look again. */
export const REBUILD_CHECK_EVENT = "gaffer:rebuild-check";
export const askRebuildCheck = () => {
  try {
    window.dispatchEvent(new Event(REBUILD_CHECK_EVENT));
  } catch {}
};
