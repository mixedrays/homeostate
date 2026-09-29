import { bootstrapApplication } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { loadConfig, PLAYGROUND_CONFIG } from "./config";

loadConfig()
  .then((config) =>
    bootstrapApplication(AppComponent, {
      providers: [{ provide: PLAYGROUND_CONFIG, useValue: config }],
    }),
  )
  .catch((error: unknown) => {
    console.error(error);
    const root = document.querySelector("app-root");
    if (root)
      root.textContent =
        "The playground could not start. Check config.json and reload.";
  });
