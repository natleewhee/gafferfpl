/* How capable the device looks, from the hints browsers give. Chrome reports memory; every browser
 * reports cores; data saver is a clear ask to go light. Safari reports no memory and few cores, so
 * these are kept conservative. */

export type DeviceHints = { hardwareConcurrency?: number; deviceMemory?: number; connection?: { saveData?: boolean } } | undefined;

/** Skip the extras (the crowd): few cores, little memory, or data saver on. */
export function lowPowerDevice(nav: DeviceHints): boolean {
  if (!nav) return true;
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory != null && nav.deviceMemory <= 2) return true;
  if (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 4) return true;
  return false;
}

/** Start on the 2D pitch unless the person chose 3D: data saver on, 2 GB of memory or less, or two
 * cores or fewer. Stricter than lowPowerDevice, because plenty of phones that report 4 cores (Safari
 * caps what it reports) run the 3D pitch well; the frame check (frameBudget.ts) catches the rest. */
export function startIn2d(nav: DeviceHints): boolean {
  if (!nav) return false;
  if (nav.connection?.saveData) return true;
  if (nav.deviceMemory != null && nav.deviceMemory <= 2) return true;
  if (nav.hardwareConcurrency != null && nav.hardwareConcurrency <= 2) return true;
  return false;
}
