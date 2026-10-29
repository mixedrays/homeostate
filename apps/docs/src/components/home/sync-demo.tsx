import { cn } from "cn";
import { PlusIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from "react";
import { HomeostateMark } from "@/components/layout/homeostate-mark.tsx";
import { createTimeline, STOPPED, type Timeline } from "@/lib/timeline.ts";

type Side = "a" | "b";
type TaskId = "docs" | "login" | "ship" | "tests" | "deps";
type Status = "synced" | "offline" | "merging";

interface Task {
  id: TaskId;
  done?: boolean;
  /** Added offline and not sent yet. */
  local?: boolean;
  /** Added by the script: the row grows in, and shrinks out (`leaving`) when the loop rewinds. */
  added?: boolean;
  leaving?: boolean;
  /** Bumped to replay the row's highlight. */
  flash?: number;
}

interface Scene {
  tasks: Record<Side, Task[]>;
  status: Status;
  caption: keyof typeof CAPTIONS;
  /** Bumped to replay a window's glow when a change reaches it. */
  glow: Record<Side, number>;
}

const TASKS: Record<TaskId, string> = {
  docs: "Write docs",
  login: "Fix login bug",
  ship: "Ship v0.4",
  tests: "Add tests",
  deps: "Bump deps",
};

const STORES: Record<Side, string> = { a: "zustand", b: "redux" };

const CAPTIONS = {
  sync: "Tick a task in one store. Every client gets the change.",
  offline: "The connection drops. Both clients keep working.",
  merge: "Back online, the edits merge. Both tasks are kept.",
  still:
    "Every client holds the same state. Offline edits merge when they reconnect.",
};

const STATUS_LABEL: Record<Status, string> = {
  synced: "Synced",
  offline: "Offline",
  merging: "Merging",
};

const STATUS_DOT: Record<Status, string> = {
  synced: "bg-emerald-500",
  offline: "bg-amber-500",
  merging: "bg-primary",
};

const both = (tasks: Task[]): Record<Side, Task[]> => ({ a: tasks, b: tasks });

const START: Scene = {
  tasks: both([{ id: "docs" }, { id: "login" }, { id: "ship" }]),
  status: "synced",
  caption: "sync",
  glow: { a: 0, b: 0 },
};

/** The loop's end state, shown on its own to visitors who ask for reduced motion. */
const STILL: Scene = {
  ...START,
  tasks: both([
    { id: "docs", done: true },
    { id: "login", done: true },
    { id: "ship" },
    { id: "tests" },
    { id: "deps" },
  ]),
  caption: "still",
};

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const media = matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * The hero's demo: two task lists on different stores, kept in sync through homeostate in the
 * middle. A scripted loop ticks a task on each side, drops the connection while both sides add
 * a task, then reconnects and merges. The prerendered HTML is the loop's first frame; visitors
 * who ask for reduced motion get its end state instead. The loop pauses while the demo is off
 * screen or the tab is hidden.
 */
export function SyncDemo() {
  const [scene, setScene] = useState(START);
  const reducedMotion = useReducedMotion();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (reducedMotion) {
      setScene(STILL);
      return;
    }

    setScene(START);
    const timeline = createTimeline();
    const stage = stageIn(root, timeline, setScene);

    let offscreen = false;
    const syncPaused = () => {
      const paused = offscreen || document.hidden;
      timeline.setPaused(paused);
      for (const animation of root.getAnimations({ subtree: true })) {
        if (paused && animation.playState === "running") animation.pause();
        else if (!paused && animation.playState === "paused") animation.play();
      }
    };
    const observer = new IntersectionObserver((entries) => {
      offscreen = !entries.at(-1)?.isIntersecting;
      syncPaused();
    });
    observer.observe(root);
    document.addEventListener("visibilitychange", syncPaused);

    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // Capped, so a long-blocked frame doesn't skip whole steps of the script.
      timeline.advance(Math.min(Math.max(now - last, 0), 50));
      last = now;
      frame = requestAnimationFrame(tick);
    });

    void (async () => {
      for (;;) await playLoop(stage);
    })().catch((error: unknown) => {
      if (error !== STOPPED) throw error;
    });

    return () => {
      timeline.stop();
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", syncPaused);
      root.getAnimations({ subtree: true }).forEach((a) => a.cancel());
      for (const { pointer } of Object.values(stage.windows)) {
        pointer.el.style.removeProperty("translate");
        pointer.el.style.removeProperty("opacity");
      }
    };
  }, [reducedMotion]);

  const offline = scene.status === "offline";

  return (
    <figure
      ref={ref}
      role="img"
      aria-label="Two task lists, one on Zustand and one on Redux, synced through Homeostate, show the same tasks. A task ticked in one list is ticked in the other. While the connection is down, each list adds a task; when it comes back, both lists have both tasks."
      className="relative overflow-hidden rounded-2xl border bg-muted/30 p-5 sm:p-6"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-size-[18px_18px] mask-[linear-gradient(to_bottom,black,transparent)]"
      />
      <div className="relative @container">
        <div className="mb-6 flex items-center justify-between gap-3">
          <span className="font-mono text-xs text-muted-foreground uppercase">
            Same state, every client
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                STATUS_DOT[scene.status],
              )}
            />
            {STATUS_LABEL[scene.status]}
          </span>
        </div>
        <div data-row className="flex flex-col @min-[26rem]:flex-row">
          <TaskWindow
            side="a"
            tasks={scene.tasks.a}
            offline={offline}
            glow={scene.glow.a}
          />
          <Wire offline={offline} />
          <TaskWindow
            side="b"
            tasks={scene.tasks.b}
            offline={offline}
            glow={scene.glow.b}
          />
        </div>
        <p
          key={scene.caption}
          className="sd-caption mt-5 min-h-10 text-center text-xs leading-relaxed text-balance text-muted-foreground"
        >
          {CAPTIONS[scene.caption]}
        </p>
      </div>
    </figure>
  );
}

function TaskWindow({
  side,
  tasks,
  offline,
  glow,
}: {
  side: Side;
  tasks: Task[];
  offline: boolean;
  glow: number;
}) {
  return (
    <div
      data-window={side}
      className="relative min-w-0 flex-1 rounded-xl border bg-card shadow-sm"
    >
      {glow > 0 && (
        <span
          key={glow}
          className="sd-glow pointer-events-none absolute -inset-px rounded-xl"
        />
      )}
      <div className="flex items-center gap-2 border-b px-2.5 py-2">
        <span className="text-xs font-semibold">Tasks</span>
        <span className="ml-auto rounded-md bg-muted px-1.5 py-1 font-mono text-[10.5px] leading-none text-muted-foreground">
          {STORES[side]}
        </span>
        <span
          className={cn(
            "size-1.75 shrink-0 rounded-full transition-colors",
            offline ? "bg-amber-500" : "bg-emerald-500",
          )}
        />
      </div>
      <div className="h-44.5 py-1.25">
        <ul>
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} />
          ))}
        </ul>
        <div
          data-add
          className="flex h-7 items-center gap-2 px-2.5 text-[12.5px] text-muted-foreground"
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
          Add task
        </div>
      </div>
      <span data-fx className="pointer-events-none absolute inset-0" />
      <svg
        data-pointer
        viewBox="0 0 16 20"
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 z-10 h-5 w-4 origin-[1px_1px] overflow-visible opacity-0 transition-opacity duration-250"
      >
        <path
          d="M1 1v15.2l4-3.7 2.6 5.8 2.5-1.1-2.5-5.6 5.3-.2z"
          strokeWidth={1.3}
          strokeLinejoin="round"
          className="fill-foreground stroke-background"
        />
      </svg>
    </div>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li
      data-task={task.id}
      data-done={task.done || undefined}
      className={cn(
        "group relative flex h-7 items-center gap-2 overflow-hidden px-2.5 text-[12.5px] whitespace-nowrap",
        task.added && "sd-enter",
        task.leaving && "sd-leave",
      )}
    >
      {task.flash ? (
        <span
          key={task.flash}
          className="sd-flash pointer-events-none absolute inset-0"
        />
      ) : null}
      <span
        data-box
        className="relative grid size-3.5 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-muted-foreground/60 transition-colors group-data-done:border-primary group-data-done:bg-primary"
      >
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-2.5 fill-none stroke-primary-foreground transition-[stroke-dashoffset] delay-50 duration-250 [stroke-dasharray:12] [stroke-dashoffset:12] group-data-done:[stroke-dashoffset:0]"
        >
          <path d="M2.6 6.3 5 8.7l4.4-5" />
        </svg>
      </span>
      <span className="relative truncate transition-colors group-data-done:text-muted-foreground group-data-done:line-through">
        {TASKS[task.id]}
      </span>
      {task.local && (
        <span className="relative ml-auto rounded-[5px] bg-amber-500/15 px-1.25 py-0.75 font-mono text-[9.5px] leading-none text-amber-600 dark:text-amber-400">
          unsynced
        </span>
      )}
    </li>
  );
}

/**
 * The link between the windows, with homeostate in the middle: a solid line and the full mark
 * while online; a dashed line and only the mark's brackets while offline.
 */
function Wire({ offline }: { offline: boolean }) {
  return (
    <div className="relative h-20 shrink-0 @min-[26rem]:h-auto @min-[26rem]:w-20">
      <span
        className={cn(
          "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 border-l-2 border-primary/45 @min-[26rem]:top-1/2 @min-[26rem]:right-0 @min-[26rem]:bottom-auto @min-[26rem]:left-0 @min-[26rem]:translate-x-0 @min-[26rem]:-translate-y-1/2 @min-[26rem]:border-t-2 @min-[26rem]:border-l-0",
          offline && "border-dashed border-amber-500",
        )}
      />
      <span data-packets className="absolute inset-0" />
      <span
        data-node
        className={cn(
          "absolute top-1/2 left-1/2 z-10 grid size-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-xl border border-primary/30 bg-card shadow-[0_4px_16px_-6px_var(--primary)] transition-[border-color,box-shadow] duration-300",
          offline && "border-amber-500/50 shadow-none",
        )}
      >
        <HomeostateMark
          state={offline ? "disconnected" : "connected"}
          className="size-7"
        />
      </span>
      <span className="absolute top-1/2 left-[calc(50%+28px)] z-10 -translate-y-1/2 font-mono text-[10px] leading-none text-muted-foreground @min-[26rem]:top-[calc(50%+28px)] @min-[26rem]:left-1/2 @min-[26rem]:-translate-x-1/2 @min-[26rem]:translate-y-0">
        homeostate
      </span>
    </div>
  );
}

interface Pointer {
  el: SVGSVGElement;
  x: number;
  y: number;
  shown: boolean;
}

interface Stage {
  timeline: Timeline;
  setScene: Dispatch<SetStateAction<Scene>>;
  row: HTMLElement;
  packets: HTMLElement;
  node: HTMLElement;
  windows: Record<Side, { el: HTMLElement; fx: HTMLElement; pointer: Pointer }>;
}

function stageIn(
  root: HTMLElement,
  timeline: Timeline,
  setScene: Dispatch<SetStateAction<Scene>>,
): Stage {
  const find = <T extends Element>(parent: ParentNode, selector: string) =>
    parent.querySelector<T>(selector)!;
  const win = (side: Side) => {
    const el = find<HTMLElement>(root, `[data-window="${side}"]`);
    const pointer = find<SVGSVGElement>(el, "[data-pointer]");
    return {
      el,
      fx: find<HTMLElement>(el, "[data-fx]"),
      pointer: { el: pointer, x: 0, y: 0, shown: false },
    };
  };
  return {
    timeline,
    setScene,
    row: find(root, "[data-row]"),
    packets: find(root, "[data-packets]"),
    node: find(root, "[data-node]"),
    windows: { a: win("a"), b: win("b") },
  };
}

/** One pass of the story: an edit each way, an edit on each side while offline, the merge. */
async function playLoop(stage: Stage) {
  const { timeline, setScene } = stage;
  const sleep = (ms: number) => timeline.sleep(ms);

  await sleep(500);
  await tap(stage, "a", '[data-task="docs"] [data-box]');
  update(stage, "a", check("docs"));
  await sleep(120);
  await relay(stage, ["a"]);
  update(stage, "b", check("docs", true), true);
  await sleep(600);
  await tap(stage, "b", '[data-task="login"] [data-box]');
  update(stage, "b", check("login"));
  await sleep(120);
  await relay(stage, ["b"]);
  update(stage, "a", check("login", true), true);
  await sleep(900);

  setScene((scene) => ({ ...scene, status: "offline", caption: "offline" }));
  await sleep(700);
  await tap(stage, "a", "[data-add]");
  update(stage, "a", (tasks) => [
    ...tasks,
    { id: "tests", added: true, local: true },
  ]);
  await sleep(350);
  await tap(stage, "b", "[data-add]");
  update(stage, "b", (tasks) => [
    ...tasks,
    { id: "deps", added: true, local: true },
  ]);
  await sleep(1100);

  setScene((scene) => ({ ...scene, status: "merging", caption: "merge" }));
  // The mark's Connect motion plays before the edits go out.
  await sleep(1100);
  await relay(stage, ["a", "b"]);
  update(
    stage,
    "a",
    (tasks) => [...sent(tasks), { id: "deps", added: true, flash: 1 }],
    true,
  );
  // Both sides end up in the same order: the other side's task lands before "Bump deps".
  update(
    stage,
    "b",
    (tasks) => {
      const kept = sent(tasks);
      return [
        ...kept.slice(0, -1),
        { id: "tests", added: true, flash: 1 },
        ...kept.slice(-1),
      ];
    },
    true,
  );
  setScene((scene) => ({ ...scene, status: "synced" }));
  await sleep(2000);

  for (const side of ["a", "b"] as const) {
    hide(stage.windows[side].pointer);
    update(stage, side, (tasks) =>
      tasks.map((task) => ({ ...task, done: false, leaving: task.added })),
    );
  }
  await sleep(450);
  setScene(START);
  await sleep(350);
}

/** Changes one window's tasks; a change that arrived over the wire also makes the window glow. */
function update(
  stage: Stage,
  side: Side,
  change: (tasks: Task[]) => Task[],
  arrived = false,
) {
  stage.setScene((scene) => ({
    ...scene,
    tasks: { ...scene.tasks, [side]: change(scene.tasks[side]) },
    glow: arrived
      ? { ...scene.glow, [side]: scene.glow[side] + 1 }
      : scene.glow,
  }));
}

const check =
  (id: TaskId, flash = false) =>
  (tasks: Task[]) =>
    tasks.map((task) =>
      task.id === id
        ? {
            ...task,
            done: true,
            flash: flash ? (task.flash ?? 0) + 1 : task.flash,
          }
        : task,
    );

const sent = (tasks: Task[]) =>
  tasks.map((task) => ({ ...task, local: false }));

/** Moves a window's pointer onto `selector` and clicks it. */
async function tap(stage: Stage, side: Side, selector: string) {
  const { el: host, fx, pointer } = stage.windows[side];
  const target = host.querySelector(selector);
  if (!target) return;
  const box = host.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - box.left - host.clientLeft + rect.width / 2;
  const y = rect.top - box.top - host.clientTop + rect.height / 2;
  if (!pointer.shown) {
    // Enters from below right of its first target, fading in on the way.
    Object.assign(pointer, { x: x + 34, y: y + 26, shown: true });
    pointer.el.style.opacity = "1";
  }
  const from = `${pointer.x}px ${pointer.y}px`;
  const to = `${x}px ${y}px`;
  Object.assign(pointer, { x, y });
  pointer.el.style.translate = to;
  pointer.el.animate(
    { translate: [from, to] },
    { duration: 620, easing: "cubic-bezier(0.45, 0.05, 0.25, 1)" },
  );
  await stage.timeline.sleep(620);

  pointer.el.animate(
    { scale: [1, 0.82, 1] },
    { duration: 220, easing: "ease-out" },
  );
  const ring = document.createElement("span");
  ring.className = "sd-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  fx.append(ring);
  removeAfter(
    ring,
    ring.animate(
      { scale: [0.3, 1.5], opacity: [0.9, 0] },
      { duration: 480, easing: "ease-out" },
    ),
  );
  await stage.timeline.sleep(170);
}

function hide(pointer: Pointer) {
  pointer.el.style.removeProperty("opacity");
  pointer.shown = false;
}

const LEG_MS = 350;

/**
 * Sends a packet from each window in `from` to the other one, through homeostate in the
 * middle, which pulses as they pass. Resolves when the packets arrive.
 */
async function relay(stage: Stage, from: Side[]) {
  from.forEach((side) => send(stage, side));
  await stage.timeline.sleep(LEG_MS);
  pulse(stage.node);
  await stage.timeline.sleep(LEG_MS);
}

/** Speeds up into the middle of the wire, then slows down out of it, one leg each. */
function send(stage: Stage, from: Side) {
  const { packets, row } = stage;
  const { clientWidth: w, clientHeight: h } = packets;
  const across = getComputedStyle(row).flexDirection === "row";
  const a = across ? `0px ${h / 2}px` : `${w / 2}px 0px`;
  const b = across ? `${w}px ${h / 2}px` : `${w / 2}px ${h}px`;
  const [start, end] = from === "a" ? [a, b] : [b, a];
  const packet = document.createElement("span");
  packet.className = "sd-packet";
  packets.append(packet);
  removeAfter(
    packet,
    packet.animate(
      [
        {
          translate: start,
          opacity: 0,
          easing: "cubic-bezier(0.5, 0, 0.9, 0.6)",
        },
        { opacity: 1, offset: 0.2 },
        {
          translate: `${w / 2}px ${h / 2}px`,
          offset: 0.5,
          easing: "cubic-bezier(0.1, 0.4, 0.5, 1)",
        },
        { opacity: 1, offset: 0.8 },
        { translate: end, opacity: 0 },
      ],
      { duration: LEG_MS * 2 },
    ),
  );
}

/** The mark's diamond bumps and a ripple spreads, as in its Connect motion. */
function pulse(node: HTMLElement) {
  node.animate({ scale: [1, 1.08, 1] }, { duration: 320, easing: "ease-out" });
  node
    .querySelector(".hm-diamond")
    ?.animate(
      { transform: ["scale(1)", "scale(1.3)", "scale(1)"] },
      { duration: 420, easing: "ease-out" },
    );
  node.querySelector(".hm-ripple")?.animate(
    {
      opacity: [0.9, 0],
      transform: ["scale(1)", "scale(3)"],
      strokeWidth: ["4px", "1.3px"],
    },
    { duration: 600, easing: "cubic-bezier(0.2, 0.6, 0.3, 1)" },
  );
}

/** Removes `el` once its animation finishes or is cancelled. */
function removeAfter(el: Element, animation: Animation) {
  const remove = () => el.remove();
  animation.finished.then(remove, remove);
}
