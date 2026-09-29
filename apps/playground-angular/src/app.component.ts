import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { JsonPipe } from "@angular/common";
import { TodoStore } from "./todo.store";
import { PLAYGROUND_CONFIG } from "./config";
import type { FilterStatus } from "@homeostate/playground-shared";

@Component({
  selector: "app-root",
  imports: [JsonPipe],
  providers: [TodoStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./app.component.html",
})
export class AppComponent {
  readonly store = inject(TodoStore);
  readonly config = inject(PLAYGROUND_CONFIG);
  readonly filters: { value: FilterStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "completed", label: "Completed" },
  ];

  addTodo(event: Event, input: HTMLInputElement) {
    event.preventDefault();
    this.store.addTodo(input.value);
    input.value = "";
    input.focus();
  }

  editTodo(id: string, input: HTMLInputElement) {
    this.store.editTodo(id, input.value);
    // Blank edits are rejected; restore the stored title in the input as well.
    input.value =
      this.store.shared.todos().find((todo) => todo.id === id)?.title ?? "";
  }
}
