import { Button } from "./components/button/button";
import { ConfirmDialogProvider, useConfirm } from "./components/confirm-dialog/confirm-dialog";
import { EmptyState } from "./components/empty-state/empty-state";
import { Skeleton } from "./components/skeleton/skeleton";
import { ThemeToggle } from "./components/theme-toggle/theme-toggle";
import { ToastProvider } from "./components/toast/toast";
import { cn } from "./lib/cn";
import { href, useRoute, type Route } from "./app/route";
import { StudyProvider, useStudy } from "./app/study";
import { Library } from "./features/01-import/Library";
import { ReviewPage } from "./features/02-review/ReviewPage";
import { SearchPage } from "./features/03-search/SearchPage";
import { ReelsPage } from "./features/04-reels/ReelsPage";
import { FindingsPage } from "./features/05-findings/FindingsPage";
import { DataPage } from "./features/06-data/DataPage";

const NAV: Array<{ label: string; to: string; pages: Route["page"][] }> = [
  { label: "Interviews", to: href.library(), pages: ["library", "review"] },
  { label: "Search", to: href.search(), pages: ["search"] },
  { label: "Reels", to: href.reels(), pages: ["reels"] },
  { label: "Findings", to: href.findings(), pages: ["findings"] },
  { label: "Data", to: href.data(), pages: ["data"] },
];

export default function App() {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <StudyProvider>
          <Shell />
        </StudyProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}

function Shell() {
  const route = useRoute();
  const { state, saveError, repaired, workspace, eraseAll } = useStudy();
  const confirm = useConfirm();
  const startOver = async () => { if (await confirm({ title: "Start a new study?", description: "The saved study that can't be read, and every stored file, are deleted from this browser.", confirmLabel: "Delete and start over", variant: "danger" })) await eraseAll(); };
  const counts: Partial<Record<Route["page"], number>> = { library: workspace.recordings.length, reels: workspace.reels.length, findings: workspace.findings.length };
  return (
    <div className="min-h-screen bg-surface text-text">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
          <a href={href.library()} className="flex items-center gap-2 font-semibold tracking-tight">
            <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0"><rect width="32" height="32" rx="8" className="fill-accent" /><path d="M7 20h3v-8H7zm5 4h3V8h-3zm5-6h3v-4h-3zm5 3h3V11h-3z" className="fill-on-accent" /></svg>
            <span>Interview Replay</span>
          </a>
          <nav aria-label="Main" className="order-last grid w-full grid-cols-5 gap-0.5 sm:order-none sm:flex sm:w-auto sm:min-w-0 sm:flex-1">
            {NAV.map(item => {
              const active = item.pages.includes(route.page);
              const count = counts[item.pages[0]];
              return (
                <a key={item.label} href={item.to} aria-current={active ? "page" : undefined}
                  className={cn("rounded-md px-1 py-1.5 text-center text-xs whitespace-nowrap transition-colors sm:shrink-0 sm:px-2.5 sm:text-left sm:text-sm", active ? "bg-accent/10 font-medium text-accent" : "text-text-muted hover:bg-surface-raised hover:text-text")}>
                  {item.label}{count ? <span className="ml-1 hidden text-xs opacity-70 tabular-nums sm:inline">{count}</span> : null}
                </a>
              );
            })}
          </nav>
          <ThemeToggle storageKey="interview-replay-theme" className="ml-auto sm:ml-0" />
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {saveError && <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">{saveError}</p>}
        {repaired > 0 && <p role="status" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{repaired} {repaired === 1 ? "link to something deleted was" : "links to things deleted were"} dropped while opening the study.</p>}
        {state.status === "loading" ? (
          <div aria-busy="true" aria-label="Opening your study" className="space-y-3"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-32 w-full" /></div>
        ) : state.status === "unavailable" ? (
          <EmptyState title="This browser won't let the page store anything" description="Storage is blocked — a private window or a site-data setting. Interview Replay keeps your study in the browser, so it can't work like this. Open it in a normal window." />
        ) : state.status !== "ready" ? (
          <EmptyState title={state.status === "newer-version" ? "Saved by a newer version" : "The saved study can't be read"} description={`${state.message} Nothing was changed or deleted.`} action={<Button variant="outline" size="sm" onClick={() => void startOver()}>Start over</Button>} />
        ) : (
          <Page route={route} />
        )}
      </main>
    </div>
  );
}

function Page({ route }: { route: Route }) {
  switch (route.page) {
    case "review": return <ReviewPage key={route.recordingId} recordingId={route.recordingId} time={route.time} />;
    case "search": return <SearchPage query={route.query} />;
    case "reels": return <ReelsPage reelId={route.reelId} />;
    case "findings": return <FindingsPage />;
    case "data": return <DataPage />;
    default: return <Library />;
  }
}
