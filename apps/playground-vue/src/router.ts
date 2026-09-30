import { createRouter, createWebHistory } from "vue-router";
import { apps, demos } from "./demos";
import HomePage from "./HomePage.vue";
import TodoStoresPage from "./TodoStoresPage.vue";

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: HomePage },
    { path: apps.todo.path, component: TodoStoresPage },
    {
      path: demos["tanstack-store"].path,
      component: () => import("./TodoPage.vue"),
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
