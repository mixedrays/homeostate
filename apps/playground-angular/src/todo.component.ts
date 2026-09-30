import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from "@angular/core";
import { JsonPipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { TODO_ROOM, type FilterStatus } from "@homeostate/playground/shared";
import { PLAYGROUND_CONFIG } from "./config";
import { apps, demos } from "./demos";
import { TodoStore, type SyncStatus } from "./todo.store";

const STATUS_LABELS: Record<SyncStatus, string> = {
  connecting: "Connecting",
  connected: "Syncing",
  synced: "Synced",
  unreachable: "Server offline",
  offline: "Offline",
};

@Component({
  selector: "app-todo",
  imports: [JsonPipe, RouterLink],
  providers: [TodoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./todo.component.html",
})
export class TodoComponent {
  readonly store = inject(TodoStore);
  readonly config = inject(PLAYGROUND_CONFIG);
  readonly demo = demos["ngrx-signals"];
  readonly back = apps.todo.path;
  readonly room = TODO_ROOM;
  readonly filters: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
  ];

  /** The composer's text, held here so the Add button can follow it. */
  readonly draft = signal("");
  readonly inspecting = signal(false);

  readonly online = computed(() => this.store.status() !== "offline");
  readonly statusLabel = computed(() => STATUS_LABELS[this.store.status()]);
  readonly statusTitle = computed(() => {
    const status = this.store.status();
    if (status === "offline") return "Sync is turned off for this tab";
    const prefix =
      status === "unreachable" ? "Sync server unreachable" : "Sync server";
    return `${prefix}: ${this.config.syncServerUrl}`;
  });

  readonly hiddenCount = computed(
    () => this.store.counts().all - this.store.visibleTodos().length,
  );
  readonly emptyState = computed(() => {
    const term = this.store.shared.searchTerm().trim();
    if (this.store.counts().all === 0) {
      return { title: "No todos yet", hint: "Add your first todo above." };
    }
    if (term) {
      return { title: "No matches", hint: `Nothing matches “${term}”.` };
    }
    if (this.store.shared.filterStatus() === "active") {
      return { title: "All done", hint: "Every todo is completed." };
    }
    return {
      title: "Nothing completed yet",
      hint: "Check off a todo to see it here.",
    };
  });

  addTodo(event: Event) {
    event.preventDefault();
    this.store.addTodo(this.draft());
    this.draft.set("");
  }

  editTodo(id: string, input: HTMLInputElement) {
    this.store.editTodo(id, input.value);
    // Blank edits are rejected; restore the stored title in the input as well.
    input.value =
      this.store.shared.todos().find((todo) => todo.id === id)?.title ?? "";
  }
}
