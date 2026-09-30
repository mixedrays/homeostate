<script lang="ts">
  import { apps, demoList } from "./demos";
  import { followLink, href } from "./router.svelte";

  const app = apps.todo;
</script>

<main class="page">
  <a class="back-link" href={href("/")} onclick={followLink}>← All demos</a>

  <header class="page-header">
    <div class="heading-row">
      <span class="mark mark-solid" aria-hidden="true">{app.mark}</span>
      <h1>{app.title}</h1>
    </div>
    <p class="intro">
      One shared todo list, {demoList.length}
      {demoList.length === 1 ? "state manager" : "state managers"}. Every store
      joins the same Yjs room as the other playgrounds, so a change made in any
      of them shows up in the others and in every other open tab. Pick a store
      to open its version.
    </p>
  </header>

  <section aria-labelledby="stores-heading">
    <h2 id="stores-heading" class="sr-only">Stores</h2>
    <ul class="card-grid card-grid-3">
      {#each demoList as demo (demo.id)}
        <li>
          <a class="card card-link" href={href(demo.path)} onclick={followLink}>
            <div class="card-heading">
              <span class="mark" aria-hidden="true">{demo.mark}</span>
              <h3 class="card-title">{demo.name}</h3>
            </div>
            <p class="card-description">{demo.description}</p>
            <span class="card-action">Open demo →</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>
</main>
