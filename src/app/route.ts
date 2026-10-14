import { useEffect, useState } from "react";

export type Route =
  | { page: "library" }
  | { page: "review"; recordingId: string; time: number | null }
  | { page: "search"; query: string }
  | { page: "reels"; reelId: string | null }
  | { page: "findings" }
  | { page: "data" };

/** Reads the hash: #/r/<id>?t=<ms>, #/search?q=…, #/reels/<id>, #/findings, #/data. */
export function parseRoute(hash: string): Route {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (parts[0] === "r" && parts[1]) {
    const t = Number(params.get("t"));
    return { page: "review", recordingId: parts[1], time: params.has("t") && Number.isSafeInteger(t) && t >= 0 ? t : null };
  }
  if (parts[0] === "search") return { page: "search", query: params.get("q") ?? "" };
  if (parts[0] === "reels") return { page: "reels", reelId: parts[1] ?? null };
  if (parts[0] === "findings") return { page: "findings" };
  if (parts[0] === "data") return { page: "data" };
  return { page: "library" };
}

export const href = {
  library: () => "#/",
  review: (recordingId: string, time?: number) => `#/r/${encodeURIComponent(recordingId)}${time === undefined ? "" : `?t=${Math.round(time)}`}`,
  search: (query = "") => (query ? `#/search?q=${encodeURIComponent(query)}` : "#/search"),
  reels: (reelId?: string) => (reelId ? `#/reels/${encodeURIComponent(reelId)}` : "#/reels"),
  findings: () => "#/findings",
  data: () => "#/data",
};

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** Updates the address without adding a history step (search typing, the playhead). */
export function replaceHash(hash: string) {
  if (location.hash !== hash) history.replaceState(null, "", hash);
}
