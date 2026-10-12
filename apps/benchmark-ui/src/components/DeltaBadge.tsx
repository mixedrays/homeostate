import { TrendingDown, TrendingUp } from "lucide-react";
import {
  formatPercent,
  isImprovement,
  isRegression,
  type MetricDelta,
} from "@homeostate/benchmark-crdt/report";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS } from "../lib/palette";

/** The change in percent, red and rising for a regression, green and falling for an improvement. */
export function DeltaBadge({ delta }: { delta: MetricDelta }) {
  const regression = isRegression(delta);
  const improvement = isImprovement(delta);
  return (
    <Badge
      variant={regression ? "destructive" : "secondary"}
      className={cn(
        "tabular-nums",
        !delta.significant && "text-muted-foreground",
      )}
      style={improvement ? { color: STATUS.goodText } : undefined}
      title={
        delta.significant
          ? regression
            ? "regression beyond the threshold"
            : "improvement beyond the threshold"
          : "within the threshold or the margin of error"
      }
    >
      {regression && <TrendingUp aria-hidden />}
      {improvement && <TrendingDown aria-hidden />}
      {formatPercent(delta.change)}
    </Badge>
  );
}
