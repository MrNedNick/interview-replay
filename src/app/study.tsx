import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DomainError, Result } from "../domain/01-import";
import type { Workspace } from "../domain/workspace";
import { EMPTY_WORKSPACE } from "../domain/workspace";
import { deleteMedia, eraseEverything, loadMedia, loadWorkspace, saveMedia, saveRemoval, saveWorkspace, storedMediaIds } from "../adapters/store";

export type StudyState =
  | { status: "loading" }
  | { status: "ready"; workspace: Workspace }
  | { status: "damaged" | "newer-version"; message: string }
  | { status: "unavailable" };

/** Where a recording's media is right now: kept in this browser, chosen for this visit only, or not here. */
export type MediaStatus = "stored" | "session" | "missing";

interface StudyApi {
  state: StudyState;
  workspace: Workspace;
  /** Set when the last change couldn't be written; the change still applies for this visit. */
  saveError: string | null;
  /** Applies a domain change and saves it. Returns the domain's error, if it refused. */
  apply: (change: (ws: Workspace) => Result<Workspace>) => Promise<DomainError | null>;
  /** Replaces the whole study (an import, a sample, a removal) and saves it. */
  replace: (ws: Workspace, removedMedia?: readonly string[]) => Promise<boolean>;
  mediaStatus: (recordingId: string) => MediaStatus;
  /** An object URL for the recording's media, or null when it isn't available. */
  mediaUrl: (recordingId: string) => Promise<string | null>;
  /** Attaches a file to a recording — stored in the browser, or for this visit only. */
  attachMedia: (recordingId: string, file: Blob, keep: boolean) => Promise<boolean>;
  eraseAll: () => Promise<boolean>;
  /** Changes whenever a file is attached, so players reload even when the status stays the same. */
  mediaRevision: number;
  /** A repaired-on-load notice: references to deleted things were dropped. */
  repaired: number;
}

const StudyContext = createContext<StudyApi | null>(null);

export function StudyProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StudyState>({ status: "loading" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [repaired, setRepaired] = useState(0);
  const [stored, setStored] = useState<ReadonlySet<string>>(new Set());
  const [session, setSession] = useState<ReadonlyMap<string, Blob>>(new Map());
  const [mediaRevision, setMediaRevision] = useState(0);
  const urls = useRef(new Map<string, string>());
  // Changes are applied to the latest study even when several land in one tick.
  const latest = useRef<Workspace>(EMPTY_WORKSPACE);

  useEffect(() => {
    let live = true;
    void Promise.all([loadWorkspace(), storedMediaIds()]).then(([loaded, ids]) => {
      if (!live) return;
      setStored(ids);
      if (loaded.status === "ready") { latest.current = loaded.workspace; setRepaired(loaded.repaired); setState({ status: "ready", workspace: loaded.workspace }); }
      else setState(loaded);
    });
    const objectUrls = urls.current;
    return () => { live = false; for (const url of objectUrls.values()) URL.revokeObjectURL(url); objectUrls.clear(); };
  }, []);

  const commit = useCallback(async (next: Workspace, write: () => Promise<boolean>) => {
    latest.current = next;
    setState({ status: "ready", workspace: next });
    const saved = await write();
    setSaveError(saved ? null : "Couldn't save to this browser's storage. Your changes apply until you close the page — export the study to keep them.");
    return saved;
  }, []);

  const apply = useCallback<StudyApi["apply"]>(async change => {
    const result = change(latest.current);
    if (!result.ok) return result.error;
    await commit(result.value, () => saveWorkspace(result.value));
    return null;
  }, [commit]);

  const forget = useCallback((ids: readonly string[]) => {
    for (const id of ids) { const url = urls.current.get(id); if (url) URL.revokeObjectURL(url); urls.current.delete(id); }
    setStored(prev => new Set([...prev].filter(id => !ids.includes(id))));
    setSession(prev => new Map([...prev].filter(([id]) => !ids.includes(id))));
  }, []);

  const replace = useCallback<StudyApi["replace"]>(async (ws, removedMedia = []) => {
    forget(removedMedia);
    return commit(ws, () => (removedMedia.length ? saveRemoval(ws, removedMedia) : saveWorkspace(ws)));
  }, [commit, forget]);

  const mediaStatus = useCallback((id: string): MediaStatus => (stored.has(id) ? "stored" : session.has(id) ? "session" : "missing"), [stored, session]);

  const mediaUrl = useCallback(async (id: string) => {
    const known = urls.current.get(id);
    if (known) return known;
    const blob = session.get(id) ?? (stored.has(id) ? await loadMedia(id) : null);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.current.set(id, url);
    return url;
  }, [session, stored]);

  const attachMedia = useCallback(async (id: string, file: Blob, keep: boolean) => {
    forget([id]);
    setMediaRevision(n => n + 1);
    if (keep && (await saveMedia(id, file))) { setStored(prev => new Set(prev).add(id)); return true; }
    if (keep) await deleteMedia([id]);
    setSession(prev => new Map(prev).set(id, file));
    return !keep;
  }, [forget]);

  const eraseAll = useCallback(async () => {
    forget([...stored, ...session.keys()]);
    const done = await eraseEverything();
    latest.current = EMPTY_WORKSPACE;
    setState({ status: "ready", workspace: EMPTY_WORKSPACE });
    setRepaired(0);
    return done;
  }, [forget, stored, session]);

  const workspace = state.status === "ready" ? state.workspace : EMPTY_WORKSPACE;
  const api = useMemo<StudyApi>(() => ({ state, workspace, saveError, apply, replace, mediaStatus, mediaUrl, attachMedia, eraseAll, repaired, mediaRevision }), [state, workspace, saveError, apply, replace, mediaStatus, mediaUrl, attachMedia, eraseAll, repaired, mediaRevision]);
  return <StudyContext.Provider value={api}>{children}</StudyContext.Provider>;
}

export function useStudy(): StudyApi {
  const api = useContext(StudyContext);
  if (!api) throw new Error("useStudy must be used inside <StudyProvider>");
  return api;
}

export const newId = () => crypto.randomUUID();
