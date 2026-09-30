import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { RouterLink } from "@angular/router";
import { PLAYGROUND_CONFIG } from "./config";
import { demos } from "./demos";

@Component({
  selector: "app-home",
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: "./home.component.html",
})
export class HomeComponent {
  readonly config = inject(PLAYGROUND_CONFIG);
  readonly demos = demos;
}
