<script lang="ts">
  import { apps, demos } from "./demos";
  import HomePage from "./HomePage.svelte";
  import { navigate, route } from "./router.svelte";
  import TodoStoresPage from "./TodoStoresPage.svelte";

  const paths = ["/", apps.todo.path, demos["tanstack-store"].path];

  $effect(() => {
    if (!paths.includes(route.path)) navigate("/", { replace: true });
  });
</script>

{#if route.path === apps.todo.path}
  <TodoStoresPage />
{:else if route.path === demos["tanstack-store"].path}
  {#await import("./TodoPage.svelte") then page}
    <page.default />
  {/await}
{:else}
  <HomePage />
{/if}
