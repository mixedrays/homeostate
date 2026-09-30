import { bootstrapApplication } from "@angular/platform-browser";
import { provideRouter } from "@angular/router";
import { AppComponent } from "./app.component";
import { routes } from "./app.routes";
import { loadConfig, PLAYGROUND_CONFIG } from "./config";

loadConfig()
  .then((config) =>
    bootstrapApplication(AppComponent, {
      providers: [
        provideRouter(routes),
        { provide: PLAYGROUND_CONFIG, useValue: config },
      ],
    }),
  )
  .catch((error: unknown) => {
    console.error(error);
    const root = document.querySelector("app-root");
    if (root)
      root.textContent =
        "The playground could not start. Check config.json and reload.";
  });
