<script lang="ts">
  import homeostateLogo from "@homeostate/playground/shared/homeostate.svg";
  import svelteLogo from "@homeostate/playground/shared/icons/svelte.svg";
  import { PLAYGROUNDS_URL, SYNC_SERVER_URL } from "./config";
  import { appList } from "./demos";
  import { followLink, href } from "./router.svelte";
</script>

<main class="page">
  <div class="brand-bar">
    <a class="brand" href={PLAYGROUNDS_URL} aria-label="Homeostate playgrounds">
      <img class="brand-logo" src={homeostateLogo} alt="" />
      <span class="brand-name">homeostate</span>
    </a>
    <a class="back-link" href={PLAYGROUNDS_URL}>← All playgrounds</a>
  </div>

  <header class="page-header">
    <div class="heading-row">
      <span class="framework-mark"><img src={svelteLogo} alt="" /></span>
      <h1>Svelte Playground</h1>
    </div>
    <p class="intro">
      Small Svelte apps that keep their state in an ordinary store and sync it
      through homeostate into a Yjs room, so every open tab works on the same
      data. Pick one to try.
    </p>
  </header>

  <section aria-labelledby="demos-heading">
    <h2 id="demos-heading" class="sr-only">Demos</h2>
    <ul class="card-grid">
      {#each appList as app (app.id)}
        <li>
          <a class="card card-link" href={href(app.path)} onclick={followLink}>
            <div class="card-heading">
              <span class="mark" aria-hidden="true">{app.mark}</span>
              <h3 class="card-title">{app.name}</h3>
            </div>
            <p class="card-description">{app.description}</p>
            <ul class="tags" aria-label="Built with">
              {#each app.tags as tag (tag)}
                <li class="tag">{tag}</li>
              {/each}
            </ul>
            <span class="card-action">{app.action} →</span>
          </a>
        </li>
      {/each}
    </ul>
  </section>

  <section aria-labelledby="steps-heading" class="steps">
    <h2 id="steps-heading" class="sr-only">Getting started</h2>
    <ol class="card-grid">
      <li>
        <div class="card">
          <h3 class="card-title">1. Start the playground</h3>
          <p class="card-description">From the repo root, run:</p>
          <pre class="command"><code>pnpm playground:svelte</code></pre>
          <p class="card-note">
            This starts the Svelte app together with the WebSocket sync server
            the demos connect to at <code>{SYNC_SERVER_URL}</code>.
            <code>pnpm playground</code> starts every framework's playground at
            once.
          </p>
        </div>
      </li>
      <li>
        <div class="card">
          <h3 class="card-title">2. Open two windows</h3>
          <p class="card-description">
            Open a demo in two tabs side by side and edit in both. The header of
            each demo shows its connection state and a
            <strong>Go offline</strong> button that cuts that tab off from sync.
            Edit on both sides, then go back online and watch the two histories
            merge.
          </p>
        </div>
      </li>
    </ol>
  </section>
</main>
