import type MiniSearch from "minisearch";
import { SearchIcon } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import {
  searchIndexOptions,
  type SearchDoc,
  type SearchResultDoc,
} from "@/lib/search.ts";

let indexPromise: Promise<MiniSearch<SearchDoc>> | undefined;

// minisearch and the index load on first open, so pages that never search don't pay for either.
function loadIndex() {
  indexPromise ??= Promise.all([
    import("minisearch"),
    fetch("/search-index.json").then((res) => {
      if (!res.ok) throw new Error(`search-index.json: ${res.status}`);
      return res.text();
    }),
  ]).then(([{ default: MiniSearchClass }, json]) =>
    MiniSearchClass.loadJSON<SearchDoc>(json, searchIndexOptions),
  );
  indexPromise.catch(() => {
    indexPromise = undefined;
  });
  return indexPromise;
}

function SearchPanel({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState<MiniSearch<SearchDoc>>();
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadIndex().then(
      (loaded) => !cancelled && setIndex(loaded),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const results = (index && query.trim()
    ? index.search(query).slice(0, 12)
    : []) as unknown as SearchResultDoc[];

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      setSelected((current) =>
        results.length ? (current + step + results.length) % results.length : 0,
      );
    } else if (event.key === "Enter" && results[selected]) {
      event.preventDefault();
      navigate(results[selected].path);
      onNavigate();
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4">
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search the docs"
          aria-label="Search the docs"
          aria-controls="search-results"
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div
        id="search-results"
        role="listbox"
        className="max-h-[min(60dvh,28rem)] overflow-y-auto p-2"
      >
        {failed && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Search is unavailable.
          </p>
        )}
        {!failed && query.trim() && index && results.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No results for “{query}”.
          </p>
        )}
        {!query.trim() && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Search guides and package docs.
          </p>
        )}
        {results.map((result, i) => (
          <Link
            key={result.id}
            to={result.path}
            role="option"
            aria-selected={i === selected}
            onClick={onNavigate}
            onMouseMove={() => setSelected(i)}
            className={cn(
              "block rounded-md px-3 py-2 text-sm",
              i === selected && "bg-muted",
            )}
          >
            <div className="text-xs text-muted-foreground">
              {result.section} › {result.page}
            </div>
            <div className="font-medium">{result.heading}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [shortcut, setShortcut] = useState("⌘K");

  useEffect(() => {
    if (!/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("Ctrl K");
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="justify-between gap-6 text-muted-foreground max-sm:size-8 max-sm:px-0 sm:w-52"
            aria-label="Search the docs"
          />
        }
      >
        <span className="flex items-center gap-2">
          <SearchIcon />
          <span className="max-sm:sr-only">Search</span>
        </span>
        <Kbd className="max-sm:hidden">{shortcut}</Kbd>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <DialogTitle className="sr-only">Search the docs</DialogTitle>
        {open && <SearchPanel onNavigate={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
