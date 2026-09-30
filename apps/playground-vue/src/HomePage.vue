<script setup lang="ts">
import { PLAYGROUNDS_URL, SYNC_SERVER_URL } from "./config";
import { appList } from "./demos";
</script>

<template>
  <main class="page">
    <a class="back-link" :href="PLAYGROUNDS_URL">← All playgrounds</a>

    <header class="page-header">
      <div class="heading-row">
        <span class="mark mark-solid" aria-hidden="true">V</span>
        <h1>Vue Playground</h1>
      </div>
      <p class="intro">
        Small Vue apps that keep their state in an ordinary store and sync it
        through homeostate into a Yjs room, so every open tab works on the same
        data. Pick one to try.
      </p>
    </header>

    <section aria-labelledby="demos-heading">
      <h2 id="demos-heading" class="sr-only">Demos</h2>
      <ul class="card-grid">
        <li v-for="app in appList" :key="app.id">
          <RouterLink class="card card-link" :to="app.path">
            <span class="mark" aria-hidden="true">{{ app.mark }}</span>
            <h3 class="card-title">{{ app.name }}</h3>
            <p class="card-description">{{ app.description }}</p>
            <ul class="tags" aria-label="Built with">
              <li v-for="tag in app.tags" :key="tag" class="tag">{{ tag }}</li>
            </ul>
            <span class="card-action">{{ app.action }} →</span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <section aria-labelledby="steps-heading" class="steps">
      <h2 id="steps-heading" class="sr-only">Getting started</h2>
      <ol class="card-grid">
        <li>
          <div class="card">
            <h3 class="card-title">1. Start the playground</h3>
            <p class="card-description">From the repo root, run:</p>
            <pre class="command"><code>pnpm playground:vue</code></pre>
            <p class="card-note">
              This starts the Vue app together with the WebSocket sync server
              the demos connect to at <code>{{ SYNC_SERVER_URL }}</code
              >. <code>pnpm playground</code> starts every framework's
              playground at once.
            </p>
          </div>
        </li>
        <li>
          <div class="card">
            <h3 class="card-title">2. Open two windows</h3>
            <p class="card-description">
              Open a demo in two tabs side by side and edit in both. The header
              of each demo shows its connection state and a
              <strong>Go offline</strong> button that cuts that tab off from
              sync. Edit on both sides, then go back online and watch the two
              histories merge.
            </p>
          </div>
        </li>
      </ol>
    </section>
  </main>
</template>
