import type { Routes } from "@angular/router";
import { apps, demos } from "./demos";
import { HomeComponent } from "./home.component";
import { TodoStoresComponent } from "./todo-stores.component";

/** Route paths are relative, the demo metadata holds them absolute for links. */
const route = (path: string) => path.slice(1);

export const routes: Routes = [
  { path: "", component: HomeComponent, pathMatch: "full" },
  { path: route(apps.todo.path), component: TodoStoresComponent },
  {
    path: route(demos["ngrx-signals"].path),
    loadComponent: () =>
      import("./todo.component").then((module) => module.TodoComponent),
  },
  { path: "**", redirectTo: "" },
];
