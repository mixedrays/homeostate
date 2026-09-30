import type { Routes } from "@angular/router";
import { HomeComponent } from "./home.component";

export const routes: Routes = [
  { path: "", component: HomeComponent, pathMatch: "full" },
  {
    path: "todo",
    loadComponent: () =>
      import("./todo.component").then((module) => module.TodoComponent),
  },
  { path: "**", redirectTo: "" },
];
