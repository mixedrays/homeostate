import type { ReactNode } from "react";
import { Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { fillSwatch, PALETTE, swatch, type Style } from "../board/shapes";
import { TOOLS, type Tool } from "../board/tools";

interface ToolbarProps {
  tool: Tool;
  /** The selected shape's style, or the style new shapes get when nothing is selected. */
  style: Style;
  /** False while the selected shape is not a box. */
  canFill: boolean;
  canDelete: boolean;
  onToolChange: (tool: Tool) => void;
  onStyleChange: (style: Partial<Style>) => void;
  onDelete: () => void;
}

export function Toolbar({
  tool,
  style,
  canFill,
  canDelete,
  onToolChange,
  onStyleChange,
  onDelete,
}: ToolbarProps) {
  const stroke = swatch(style.color);
  const fill = fillSwatch(style.fill);

  return (
    <div
      role="toolbar"
      aria-label="Drawing tools"
      className="absolute top-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border bg-background/95 p-1 shadow-md backdrop-blur"
    >
      <ToggleGroup
        aria-label="Tool"
        value={[tool]}
        onValueChange={(value) => {
          // Pressing the current tool again would leave none picked.
          const next = value[0] as Tool | undefined;
          if (next) onToolChange(next);
        }}
      >
        {TOOLS.map(({ id, label, icon: Icon, key }) => (
          <Tooltip key={id}>
            <TooltipTrigger
              render={<ToggleGroupItem value={id} aria-label={label} />}
            >
              <Icon />
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {label} <Kbd>{key}</Kbd>
            </TooltipContent>
          </Tooltip>
        ))}
      </ToggleGroup>

      <Separator orientation="vertical" className="mx-1 h-6 self-center" />

      <SwatchPicker
        title="Stroke"
        description={`Stroke: ${stroke.name}`}
        trigger={
          <span
            className="size-4 rounded-full border-[3px]"
            style={{ borderColor: stroke.stroke }}
          />
        }
        swatches={PALETTE.map((entry, index) => ({
          value: index,
          name: entry.name,
          color: entry.stroke,
        }))}
        value={style.color}
        onChange={(color) => onStyleChange({ color: color ?? 0 })}
      />
      <SwatchPicker
        title="Fill"
        description={
          canFill
            ? `Fill: ${fill?.name ?? "None"}`
            : "Fill: only boxes have one"
        }
        disabled={!canFill}
        trigger={
          <span
            className="flex size-4 items-center justify-center rounded-sm border border-foreground/30"
            style={{ backgroundColor: fill?.fill }}
          >
            {!fill && <Ban className="size-3 text-muted-foreground" />}
          </span>
        }
        swatches={[
          { value: null, name: "None", color: null },
          ...PALETTE.map((entry, index) => ({
            value: index,
            name: entry.name,
            color: entry.fill,
          })),
        ]}
        value={style.fill}
        onChange={(fill) => onStyleChange({ fill })}
      />

      <Separator orientation="vertical" className="mx-1 h-6 self-center" />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete the selected shape"
              disabled={!canDelete}
              onClick={onDelete}
            />
          }
        >
          <Trash2 />
        </TooltipTrigger>
        <TooltipContent side="bottom">
          Delete <Kbd>Del</Kbd>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

interface SwatchOption {
  value: number | null;
  name: string;
  /** Null draws the "no fill" swatch. */
  color: string | null;
}

interface SwatchPickerProps {
  title: string;
  /** The trigger's label, naming the current colour. */
  description: string;
  trigger: ReactNode;
  swatches: readonly SwatchOption[];
  value: number | null;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}

function SwatchPicker({
  title,
  description,
  trigger,
  swatches,
  value,
  disabled,
  onChange,
}: SwatchPickerProps) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={description}
                  disabled={disabled}
                />
              }
            />
          }
        >
          {trigger}
        </TooltipTrigger>
        <TooltipContent side="bottom">{description}</TooltipContent>
      </Tooltip>
      <PopoverContent side="bottom" className="w-auto">
        <PopoverTitle className="text-xs text-muted-foreground">
          {title}
        </PopoverTitle>
        <div className="grid grid-cols-5 gap-1.5">
          {swatches.map((option) => (
            <button
              key={option.name}
              type="button"
              aria-label={option.name}
              aria-pressed={option.value === value}
              title={option.name}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex size-7 items-center justify-center rounded-full border border-foreground/15 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                "aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover",
              )}
              style={{ backgroundColor: option.color ?? undefined }}
            >
              {option.color === null && (
                <Ban className="size-4 text-muted-foreground" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
