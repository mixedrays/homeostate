<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import { useSelector } from "@tanstack/vue-store";
import { TODO_ROOM, type FilterStatus } from "@homeostate/playground/shared";
import { mountDevtools } from "@homeostate/tool-devtools/mount";
import { SYNC_SERVER_URL } from "./config";
import { apps, demos } from "./demos";
import { createTodoStore, type SyncStatus } from "./todo.store";

const STATUS_LABELS: Record<SyncStatus, string> = {
  connecting: "Connecting",
  connected: "Syncing",
  synced: "Synced",
  unreachable: "Server offline",
  offline: "Offline",
};

const filters: { value: FilterStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

const demo = demos["tanstack-store"];
const back = apps.todo.path;

// Each visit gets its own store and connection, closed again when the page is left.
const todoStore = createTodoStore(SYNC_SERVER_URL);
onScopeDispose(todoStore.destroy);

const { actions } = todoStore.store;
const { status, toggleConnection } = todoStore;
const state = useSelector(todoStore.store);
const visibleTodos = useSelector(todoStore.visibleTodos);
const counts = useSelector(todoStore.counts);

/** The composer's text, held here so the Add button can follow it. */
const draft = ref("");
const inspecting = ref(false);

// The devtools render in a shadow root on the body; Inspect state opens and closes them.
const devtools = mountDevtools({
  sources: [todoStore.devtoolsSource],
  open: false,
  onOpenChange: (open) => {
    inspecting.value = open;
  },
});
watch(inspecting, (open) => devtools.update({ open }));
onScopeDispose(devtools.unmount);

const online = computed(() => status.value !== "offline");
const statusTitle = computed(() => {
  if (status.value === "offline") return "Sync is turned off for this tab";
  const prefix =
    status.value === "unreachable" ? "Sync server unreachable" : "Sync server";
  return `${prefix}: ${SYNC_SERVER_URL}`;
});

const hiddenCount = computed(
  () => counts.value.all - visibleTodos.value.length,
);
const emptyState = computed(() => {
  const term = state.value.searchTerm.trim();
  if (counts.value.all === 0) {
    return { title: "No todos yet", hint: "Add your first todo above." };
  }
  if (term) {
    return { title: "No matches", hint: `Nothing matches “${term}”.` };
  }
  if (state.value.filterStatus === "active") {
    return { title: "All done", hint: "Every todo is completed." };
  }
  return {
    title: "Nothing completed yet",
    hint: "Check off a todo to see it here.",
  };
});

function addTodo() {
  actions.addTodo(draft.value);
  draft.value = "";
}

function editTodo(id: string, input: HTMLInputElement) {
  actions.editTodo(id, input.value);
  // Blank edits are rejected; restore the stored title in the input as well.
  input.value = state.value.todos.find((todo) => todo.id === id)?.title ?? "";
}
</script>

<template>
  <header class="demo-bar">
    <div class="demo-bar-inner">
      <RouterLink class="bar-button" :to="back">← All stores</RouterLink>
      <div class="demo-bar-actions">
        <span
          class="status"
          role="status"
          aria-live="polite"
          :data-status="status"
          :title="statusTitle"
        >
          <span class="status-dot" aria-hidden="true"></span
          >{{ STATUS_LABELS[status] }}
        </span>
        <button
          class="bar-button outlined"
          type="button"
          :aria-pressed="!online"
          :title="
            online
              ? 'Disconnect from the sync server to edit offline'
              : 'Reconnect and merge the edits made while offline'
          "
          @click="toggleConnection"
        >
          {{ online ? "Go offline" : "Go online" }}
        </button>
        <button
          class="bar-button outlined"
          type="button"
          :aria-expanded="inspecting"
          @click="inspecting = !inspecting"
        >
          Inspect state
        </button>
      </div>
    </div>
  </header>

  <main class="page page-narrow">
    <div class="demo-heading">
      <span class="mark" aria-hidden="true">{{ demo.mark }}</span>
      <div>
        <h1 class="demo-title">{{ demo.title }}</h1>
        <p class="demo-description">{{ demo.description }}</p>
        <p class="demo-hint">
          To see this store, its Yjs document and a log of every change, and to
          edit them, open the devtools with <strong>Inspect state</strong> or
          the round button in the bottom-right corner.
        </p>
      </div>
    </div>

    <div class="demo-body">
      <div v-if="status === 'offline'" class="notice" role="status">
        <strong>Offline. This tab is disconnected from sync.</strong>
        <p>
          Edits stay in this tab and other tabs keep going without them. Hit
          <b>Go online</b> and both sides merge, no edits lost.
        </p>
      </div>
      <div
        v-if="status === 'unreachable'"
        class="notice notice-destructive"
        role="status"
      >
        <strong>Sync server unreachable.</strong>
        <p>
          Tabs in this browser still sync with each other, but other browsers
          will not. Start the server with
          <code>pnpm --filter @homeostate/websocket-server-yjs dev</code>. This
          page reconnects on its own.
        </p>
      </div>

      <section
        class="card todo-card"
        role="region"
        :aria-label="`${demo.name} todo list`"
      >
        <form class="composer" @submit.prevent="addTodo">
          <label class="sr-only" for="new-todo">New todo</label>
          <input
            id="new-todo"
            v-model="draft"
            type="text"
            placeholder="What needs to be done?"
            autocomplete="off"
            maxlength="200"
          />
          <button
            class="button primary"
            type="submit"
            :disabled="!draft.trim()"
          >
            + Add
          </button>
        </form>

        <div class="filters-row">
          <div class="search-field">
            <label class="sr-only" for="search">Search todos</label>
            <input
              id="search"
              type="search"
              placeholder="Search todos"
              autocomplete="off"
              :value="state.searchTerm"
              @input="
                actions.setSearchTerm(($event.target as HTMLInputElement).value)
              "
            />
            <button
              v-if="state.searchTerm"
              class="clear-search"
              type="button"
              aria-label="Clear search"
              @click="actions.setSearchTerm('')"
            >
              ×
            </button>
          </div>

          <div class="filters" role="group" aria-label="Filter by status">
            <button
              v-for="filter in filters"
              :key="filter.value"
              type="button"
              class="filter"
              :aria-pressed="state.filterStatus === filter.value"
              @click="actions.setFilterStatus(filter.value)"
            >
              {{ filter.label }} <span>{{ counts[filter.value] }}</span>
            </button>
          </div>
        </div>

        <div class="todo-list-block">
          <div class="list-summary">
            <p>
              <strong>{{ counts.active }}</strong>
              {{ counts.active === 1 ? "todo" : "todos" }} left
            </p>
            <p v-if="hiddenCount > 0">{{ hiddenCount }} hidden by filters</p>
          </div>

          <div v-if="visibleTodos.length === 0" class="empty-state">
            <span class="mark" aria-hidden="true">✓</span>
            <h3>{{ emptyState.title }}</h3>
            <p>{{ emptyState.hint }}</p>
          </div>
          <ul v-else class="todo-list">
            <li
              v-for="todo in visibleTodos"
              :key="todo.id"
              class="todo-row"
              :class="{ completed: todo.completed }"
            >
              <button
                type="button"
                class="icon-button toggle-button"
                :aria-pressed="todo.completed"
                :aria-label="`Mark &quot;${todo.title}&quot; as ${
                  todo.completed ? 'not completed' : 'completed'
                }`"
                @click="actions.toggleTodo(todo.id)"
              >
                {{ todo.completed ? "✓" : "○" }}
              </button>
              <input
                class="todo-title"
                type="text"
                placeholder="Untitled todo"
                aria-label="Todo title"
                autocomplete="off"
                maxlength="200"
                :value="todo.title"
                @change="editTodo(todo.id, $event.target as HTMLInputElement)"
                @keydown.enter="($event.target as HTMLInputElement).blur()"
              />
              <button
                type="button"
                class="icon-button delete-button"
                :aria-label="`Delete &quot;${todo.title}&quot;`"
                @click="actions.deleteTodo(todo.id)"
              >
                ×
              </button>
            </li>
          </ul>
        </div>
      </section>
    </div>

    <p class="demo-footer">
      Every store joins the room <code>{{ TODO_ROOM }}</code
      >. Open another store or a second tab to watch changes propagate.
    </p>
  </main>
</template>
