import { EMPTY_WORKSPACE, restoreWorkspace, type Workspace } from "../domain/workspace";

const DB = "interview-replay";
const WORKSPACE = "workspace";
const MEDIA = "media";

export type LoadResult =
  | { status: "ready"; workspace: Workspace; repaired: number }
  | { status: "damaged" | "newer-version"; message: string }
  | { status: "unavailable" };

function open(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error("IndexedDB is not available")); return; }
    const request = factory.open(DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WORKSPACE);
      request.result.createObjectStore(MEDIA);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Storage is busy in another tab."));
  });
}
async function run<T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      const request = work(tx);
      tx.oncomplete = () => resolve(request ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error("Storage operation was cancelled."));
    });
  } finally { db.close(); }
}

/** The saved study, re-checked on the way in. A record that no longer reads is reported, never loaded halfway or deleted. */
export async function loadWorkspace(): Promise<LoadResult> {
  let raw: unknown;
  try { raw = await run([WORKSPACE], "readonly", tx => tx.objectStore(WORKSPACE).get("current")); } catch { return { status: "unavailable" }; }
  if (raw === undefined) return { status: "ready", workspace: EMPTY_WORKSPACE, repaired: 0 };
  const restored = restoreWorkspace(raw);
  if (!restored.ok) return { status: restored.error.code, message: restored.error.message };
  return { status: "ready", workspace: restored.value.workspace, repaired: restored.value.repaired };
}
export async function saveWorkspace(workspace: Workspace): Promise<boolean> {
  try { await run([WORKSPACE], "readwrite", tx => tx.objectStore(WORKSPACE).put(workspace, "current")); return true; } catch { return false; }
}

/** Media files are kept as blobs under the recording's id, apart from the study so it stays small to read and write. */
export async function saveMedia(recordingId: string, blob: Blob): Promise<boolean> {
  try { await run([MEDIA], "readwrite", tx => tx.objectStore(MEDIA).put(blob, recordingId)); return true; } catch { return false; }
}
export async function loadMedia(recordingId: string): Promise<Blob | null> {
  try {
    const blob = await run<unknown>([MEDIA], "readonly", tx => tx.objectStore(MEDIA).get(recordingId));
    return blob instanceof Blob ? blob : null;
  } catch { return null; }
}
export async function storedMediaIds(): Promise<Set<string>> {
  try { return new Set(((await run<IDBValidKey[]>([MEDIA], "readonly", tx => tx.objectStore(MEDIA).getAllKeys())) ?? []).map(String)); } catch { return new Set(); }
}
export async function deleteMedia(recordingIds: readonly string[]): Promise<boolean> {
  if (recordingIds.length === 0) return true;
  try { await run([MEDIA], "readwrite", tx => { for (const id of recordingIds) tx.objectStore(MEDIA).delete(id); }); return true; } catch { return false; }
}
/** Saves the study and drops removed recordings' media in one transaction, so a deletion is never half done. */
export async function saveRemoval(workspace: Workspace, recordingIds: readonly string[]): Promise<boolean> {
  try {
    await run([WORKSPACE, MEDIA], "readwrite", tx => {
      tx.objectStore(WORKSPACE).put(workspace, "current");
      for (const id of recordingIds) tx.objectStore(MEDIA).delete(id);
    });
    return true;
  } catch { return false; }
}
export async function eraseEverything(): Promise<boolean> {
  try { await run([WORKSPACE, MEDIA], "readwrite", tx => { tx.objectStore(WORKSPACE).clear(); tx.objectStore(MEDIA).clear(); }); return true; } catch { return false; }
}
/** Asks the browser not to evict stored media under storage pressure; refusal just means it might. */
export async function askToPersist(): Promise<boolean> {
  try { return (await navigator.storage?.persisted?.()) || ((await navigator.storage?.persist?.()) ?? false); } catch { return false; }
}
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate && estimate.usage !== undefined && estimate.quota ? { usage: estimate.usage, quota: estimate.quota } : null;
  } catch { return null; }
}
