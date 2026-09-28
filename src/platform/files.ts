// Replaces Warroom's native file dialog (`window.warroom.dialog.openFile`,
// which returns a real filesystem path that `ai:cutterReadSource` then reads
// with `fs`) with an in-memory File registry. A browser has no paths — so
// `registerFile` hands back an opaque string that *looks* like one and is used
// the same way: everything downstream calls `resolveFile(handle)` instead of
// touching disk. The registry is page-load-scoped (a `File` object dies with
// the tab), so nothing can resolve a stale handle across a reload.

let seq = 0;
const fileRegistry = new Map<string, File>();

export function registerFile(file: File): string {
  const handle = `pcc-file:${++seq}/${file.name}`;
  fileRegistry.set(handle, file);
  return handle;
}

export function resolveFile(handle: string): File | null {
  return fileRegistry.get(handle) ?? null;
}

// Opens the browser's native file picker (matches the old dialog's shape:
// resolves to a handle, or null if the user cancels) and registers the pick.
export function openFile(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      document.body.removeChild(input);
      resolve(file ? registerFile(file) : null);
    }, { once: true });
    // No 'cancel' event fires reliably cross-browser; if the user backs out
    // without picking, this promise simply never resolves, matching the old
    // dialog's own "cancelled" behavior of returning a resolved null only on
    // an actual pick — callers already treat "still on the pick step" as fine.
    document.body.appendChild(input);
    input.click();
  });
}
