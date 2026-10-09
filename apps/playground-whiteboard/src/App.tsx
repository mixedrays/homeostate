import homeostateLogo from "@homeostate/playground/shared/homeostate.svg";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Braces, CloudOff, Terminal } from "lucide-react";
import { HomeostateDevtools } from "@homeostate/tool-devtools";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  createPointerPublisher,
  readJoinedName,
  setLocalSelection,
  setLocalUser,
  storeJoinedName,
  toUser,
} from "./board/presence";
import {
  applyStyle,
  DEFAULT_STYLE,
  readShapes,
  type Style,
} from "./board/shapes";
import {
  awareness,
  devtoolsSource,
  identity,
  useBoardStore,
  wsProvider,
} from "./board/store";
import { TOOLS, type Tool } from "./board/tools";
import { Board } from "./components/Board";
import { InlineCode } from "./components/InlineCode";
import { JoinDialog } from "./components/JoinDialog";
import { PeopleList } from "./components/PeopleList";
import { SyncStatus } from "./components/SyncStatus";
import { SyncToggle } from "./components/SyncToggle";
import { Toolbar } from "./components/Toolbar";
import { usePeers } from "./hooks/usePeers";
import { useSyncConnection } from "./hooks/useSyncConnection";
import { REACT_PLAYGROUND_URL, WHITEBOARD_ROOM } from "./sync";

const { updateShape, removeShape } = useBoardStore.getState();
const publishPointer = createPointerPublisher(awareness);
const ignorePointer = () => {};

/** Keys typed into a field are text, not shortcuts. */
const isTyping = (target: EventTarget | null) =>
  target instanceof Element &&
  target.closest("input, textarea, [contenteditable]") !== null;

export default function App() {
  const record = useBoardStore((state) => state.shapes);
  const shapes = useMemo(() => readShapes(record), [record]);
  const peers = usePeers(awareness);
  const { status, online, toggle } = useSyncConnection(wsProvider);

  const [joinedName, setJoinedName] = useState(readJoinedName);
  const [renaming, setRenaming] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>(DEFAULT_STYLE);

  const joined = joinedName !== null;
  // Someone else can delete the shape this tab has selected or is editing.
  const selected = shapes.find((entry) => entry.id === selectedId);
  const activeSelectedId = selected ? selectedId : null;
  const activeEditingId = shapes.some((entry) => entry.id === editingId)
    ? editingId
    : null;

  // A tab shows up in the room's presence only once it has a name, typed or anonymous.
  useEffect(() => {
    if (joinedName !== null)
      setLocalUser(awareness, toUser(identity, joinedName));
  }, [joinedName]);

  useEffect(() => {
    setLocalSelection(awareness, joined ? activeSelectedId : null);
  }, [joined, activeSelectedId]);

  const join = (name: string) => {
    storeJoinedName(name);
    setJoinedName(name.trim());
    setRenaming(false);
  };

  const changeTool = useCallback((next: Tool) => {
    setTool(next);
    // Colours picked for the next shape would otherwise repaint the selected one.
    if (next !== "select") setSelectedId(null);
  }, []);

  const handBack = useCallback(() => setTool("select"), []);

  const deleteSelected = useCallback(() => {
    if (!activeSelectedId) return;
    removeShape(activeSelectedId);
    setSelectedId(null);
  }, [activeSelectedId]);

  /** Restyles the selected shape, and the shapes drawn after it. */
  const changeStyle = (patch: Partial<Style>) => {
    setStyle((current) => ({ ...current, ...patch }));
    if (activeSelectedId)
      updateShape(activeSelectedId, (shape) => applyStyle(shape, patch));
  };

  useEffect(() => {
    if (!joined || renaming) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteSelected();
      } else if (event.key === "Escape") {
        setSelectedId(null);
        setTool("select");
      } else {
        const match = TOOLS.find(
          ({ key }) => key.toLowerCase() === event.key.toLowerCase(),
        );
        if (match) changeTool(match.id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [joined, renaming, deleteSelected, changeTool]);

  const shownStyle: Style = selected
    ? {
        color: selected.shape.color,
        fill: selected.shape.kind === "box" ? selected.shape.fill : style.fill,
      }
    : style;
  const alone = peers.every((peer) => peer.isLocal);

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-background text-foreground">
        <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b bg-background px-3">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<a href={REACT_PLAYGROUND_URL} />}
              aria-label="React playground"
            >
              <ArrowLeft aria-hidden />
              <span className="max-md:hidden">React playground</span>
            </Button>
            <Separator
              orientation="vertical"
              className="mx-1.5 h-5 self-center max-sm:hidden"
            />
            <img
              src={homeostateLogo}
              alt=""
              className="mr-1 size-6 max-sm:hidden"
            />
            <h1 className="truncate font-heading text-base font-semibold tracking-tight">
              Whiteboard
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {joined && (
              <PeopleList peers={peers} onRename={() => setRenaming(true)} />
            )}
            <SyncStatus status={status} />
            <SyncToggle online={online} onToggle={toggle} />
            <Button
              variant="outline"
              size="sm"
              aria-expanded={inspecting}
              onClick={() => setInspecting(!inspecting)}
            >
              <Braces aria-hidden />
              <span className="max-lg:sr-only">Inspect state</span>
            </Button>
          </div>
        </header>

        <main className="relative min-h-0 flex-1">
          <Board
            shapes={shapes}
            tool={tool}
            style={style}
            selectedId={activeSelectedId}
            editingId={activeEditingId}
            peers={peers}
            onSelect={setSelectedId}
            onEdit={setEditingId}
            onDrawn={handBack}
            onPointer={joined ? publishPointer : ignorePointer}
          />
          <Toolbar
            tool={tool}
            style={shownStyle}
            canFill={!selected || selected.shape.kind === "box"}
            canDelete={activeSelectedId !== null}
            onToolChange={changeTool}
            onStyleChange={changeStyle}
            onDelete={deleteSelected}
          />

          <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex flex-col items-center gap-2">
            {status === "offline" && <OfflineNotice />}
            {status === "unreachable" && <ServerDownNotice />}
            {joined && alone && (
              <p className="rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                Open this page in another tab to draw together. Every tab joins
                the room <InlineCode>{WHITEBOARD_ROOM}</InlineCode>.
              </p>
            )}
          </div>
        </main>

        <JoinDialog
          open={!joined || renaming}
          identity={identity}
          joinedName={joinedName}
          onJoin={join}
          onCancel={() => setRenaming(false)}
        />
        <HomeostateDevtools
          sources={[devtoolsSource]}
          open={inspecting}
          onOpenChange={setInspecting}
        />
      </div>
    </TooltipProvider>
  );
}

function OfflineNotice() {
  return (
    <Alert role="status" className="pointer-events-auto max-w-md shadow-md">
      <CloudOff />
      <AlertTitle>Offline. This tab is disconnected from sync.</AlertTitle>
      <AlertDescription>
        Draw on and the other tabs keep going without you. Hit{" "}
        <span className="font-medium text-foreground">Go online</span> and both
        sides merge, no shapes lost.
      </AlertDescription>
    </Alert>
  );
}

function ServerDownNotice() {
  return (
    <Alert
      role="status"
      variant="destructive"
      className="pointer-events-auto max-w-md shadow-md"
    >
      <Terminal />
      <AlertTitle>Sync server unreachable.</AlertTitle>
      <AlertDescription>
        Tabs in this browser still sync with each other, but other browsers will
        not. Start the server with{" "}
        <InlineCode>
          pnpm --filter @homeostate/websocket-server-yjs dev
        </InlineCode>
        . This page reconnects on its own.
      </AlertDescription>
    </Alert>
  );
}
