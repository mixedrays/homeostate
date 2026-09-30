import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PLAYGROUND_CONFIG } from "./config";
import { appList } from "./demos";

@Component({
  selector: "app-home",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./home.component.html",
})
export class HomeComponent {
  readonly config = inject(PLAYGROUND_CONFIG);
  readonly apps = appList;
}
