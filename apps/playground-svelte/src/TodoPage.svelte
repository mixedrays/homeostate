<script lang="ts">
  import { onDestroy } from "svelte";
  import { useSelector } from "@tanstack/svelte-store";
  import { TODO_ROOM, type FilterStatus } from "@homeostate/playground/shared";
  import { mountDevtools } from "@homeostate/tool-devtools/mount";
  import { SYNC_SERVER_URL } from "./config";
  import { apps, demos } from "./demos";
  import { followLink, href } from "./router.svelte";
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
  onDestroy(todoStore.destroy);

  const { actions } = todoStore.store;
  const shared = useSelector(todoStore.store);
  const visibleTodos = useSelector(todoStore.visibleTodos);
  const counts = useSelector(todoStore.counts);
  const status = useSelector(todoStore.status);

  /** The composer's text, held here so the Add button can follow it. */
  let draft = $state("");
  let inspecting = $state(false);

  // The devtools render in a shadow root on the body; Inspect state opens and closes them.
  const devtools = mountDevtools({
    sources: [todoStore.devtoolsSource],
    open: false,
    onOpenChange: (open) => (inspecting = open),
  });
  $effect(() => devtools.update({ open: inspecting }));
  onDestroy(devtools.unmount);

  const online = $derived(status.current !== "offline");
  const statusTitle = $derived.by(() => {
    if (status.current === "offline") return "Sync is turned off for this tab";
    const prefix =
      status.current === "unreachable"
        ? "Sync server unreachable"
        : "Sync server";
    return `${prefix}: ${SYNC_SERVER_URL}`;
  });

  const hiddenCount = $derived(
    counts.current.all - visibleTodos.current.length,
  );
  const emptyState = $derived.by(() => {
    const term = shared.current.searchTerm.trim();
    if (counts.current.all === 0) {
      return { title: "No todos yet", hint: "Add your first todo above." };
    }
    if (term) {
      return { title: "No matches", hint: `Nothing matches “${term}”.` };
    }
    if (shared.current.filterStatus === "active") {
      return { title: "All done", hint: "Every todo is completed." };
    }
    return {
      title: "Nothing completed yet",
      hint: "Check off a todo to see it here.",
    };
  });

  function addTodo(event: SubmitEvent) {
    event.preventDefault();
    actions.addTodo(draft);
    draft = "";
  }

  function editTodo(id: string, input: HTMLInputElement) {
    actions.editTodo(id, input.value);
    // Blank edits are rejected; restore the stored title in the input as well.
    input.value =
      todoStore.store.state.todos.find((todo) => todo.id === id)?.title ?? "";
  }
</script>

<header class="demo-bar">
  <div class="demo-bar-inner">
    <a class="bar-button" href={href(back)} onclick={followLink}>
      ← All stores
    </a>
    <div class="demo-bar-actions">
      <span
        class="status"
        role="status"
        aria-live="polite"
        data-status={status.current}
        title={statusTitle}
      >
        <span class="status-dot" aria-hidden="true"
        ></span>{STATUS_LABELS[status.current]}
      </span>
      <button
        class="bar-button outlined"
        type="button"
        class:offline={!online}
        title={online
          ? "Disconnect from the sync server to edit offline"
          : "Reconnect and merge the edits made while offline"}
        onclick={todoStore.toggleConnection}
      >
        {online ? "Go offline" : "Go online"}
      </button>
      <button
        class="bar-button outlined"
        type="button"
        aria-expanded={inspecting}
        onclick={() => (inspecting = !inspecting)}
      >
        Inspect state
      </button>
    </div>
  </div>
</header>

<main class="page page-narrow">
  <div class="demo-heading">
    <span class="mark" aria-hidden="true">{demo.mark}</span>
    <div>
      <h1 class="demo-title">{demo.title}</h1>
      <p class="demo-description">{demo.description}</p>
      <p class="demo-hint">
        To see this store, its Yjs document and a log of every change, and to
        edit them, open the devtools with <strong>Inspect state</strong> or the
        round button in the bottom-right corner.
      </p>
    </div>
  </div>

  <div class="demo-body">
    {#if status.current === "offline"}
      <div class="notice" role="status">
        <strong>Offline. This tab is disconnected from sync.</strong>
        <p>
          Edits stay in this tab and other tabs keep going without them. Hit
          <b>Go online</b> and both sides merge, no edits lost.
        </p>
      </div>
    {/if}
    {#if status.current === "unreachable"}
      <div class="notice notice-destructive" role="status">
        <strong>Sync server unreachable.</strong>
        <p>
          Tabs in this browser still sync with each other, but other browsers
          will not. Start the server with
          <code>pnpm --filter @homeostate/websocket-server-yjs dev</code>. This
          page reconnects on its own.
        </p>
      </div>
    {/if}

    <section
      class="card todo-card"
      aria-label={`${demo.name} todo list`}
    >
      <form class="composer" onsubmit={addTodo}>
        <label class="sr-only" for="new-todo">New todo</label>
        <input
          id="new-todo"
          type="text"
          placeholder="What needs to be done?"
          autocomplete="off"
          maxlength="200"
          bind:value={draft}
        />
        <button class="button primary" type="submit" disabled={!draft.trim()}>
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
            value={shared.current.searchTerm}
            oninput={(event) => actions.setSearchTerm(event.currentTarget.value)}
          />
          {#if shared.current.searchTerm}
            <button
              class="clear-search"
              type="button"
              aria-label="Clear search"
              onclick={() => actions.setSearchTerm("")}
            >
              ×
            </button>
          {/if}
        </div>

        <div class="filters" role="group" aria-label="Filter by status">
          {#each filters as filter (filter.value)}
            <button
              type="button"
              class="filter"
              aria-pressed={shared.current.filterStatus === filter.value}
              onclick={() => actions.setFilterStatus(filter.value)}
            >
              {filter.label} <span>{counts.current[filter.value]}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="todo-list-block">
        <div class="list-summary">
          <p>
            <strong>{counts.current.active}</strong>
            {counts.current.active === 1 ? "todo" : "todos"} left
          </p>
          {#if hiddenCount > 0}
            <p>{hiddenCount} hidden by filters</p>
          {/if}
        </div>

        {#if visibleTodos.current.length === 0}
          <div class="empty-state">
            <span class="mark" aria-hidden="true">✓</span>
            <h3>{emptyState.title}</h3>
            <p>{emptyState.hint}</p>
          </div>
        {:else}
          <ul class="todo-list">
            {#each visibleTodos.current as todo (todo.id)}
              <li class={["todo-row", todo.completed && "completed"]}>
                <button
                  type="button"
                  class="icon-button toggle-button"
                  aria-pressed={todo.completed}
                  aria-label={`Mark "${todo.title}" as ${
                    todo.completed ? "not completed" : "completed"
                  }`}
                  onclick={() => actions.toggleTodo(todo.id)}
                >
                  {todo.completed ? "✓" : "○"}
                </button>
                <input
                  class="todo-title"
                  type="text"
                  placeholder="Untitled todo"
                  aria-label="Todo title"
                  autocomplete="off"
                  maxlength="200"
                  value={todo.title}
                  onchange={(event) => editTodo(todo.id, event.currentTarget)}
                  onkeydown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                />
                <button
                  type="button"
                  class="icon-button delete-button"
                  aria-label={`Delete "${todo.title}"`}
                  onclick={() => actions.deleteTodo(todo.id)}
                >
                  ×
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
  </div>

  <p class="demo-footer">
    Every store joins the room <code>{TODO_ROOM}</code>. Open another store or a
    second tab to watch changes propagate.
  </p>
</main>
