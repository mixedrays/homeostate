import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  viewChild,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import { mountHomeostateMark } from "@homeostate/playground/shared";
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
  private readonly logo = viewChild.required<ElementRef<HTMLElement>>("logo");

  constructor() {
    // The homeostate mark; hovering the link around it plays the Connect motion.
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      destroyRef.onDestroy(mountHomeostateMark(this.logo().nativeElement));
    });
  }
}
