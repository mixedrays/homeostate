import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterLink } from "@angular/router";
import { apps, demoList } from "./demos";

@Component({
  selector: "app-todo-stores",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./todo-stores.component.html",
})
export class TodoStoresComponent {
  readonly app = apps.todo;
  readonly demos = demoList;
}
