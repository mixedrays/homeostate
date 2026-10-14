import {
  ArrowDownLeft,
  ArrowDownRight,
  ArrowUpLeft,
  ArrowUpRight,
  Monitor,
  Moon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Settings,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../components/ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group";
import type { ButtonPosition, DevtoolsTheme, PanelPosition } from "../options";

interface Option<T extends string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

const SIDES: Option<PanelPosition>[] = [
  { value: "right", label: "Dock to the right", icon: PanelRight },
  { value: "left", label: "Dock to the left", icon: PanelLeft },
  { value: "bottom", label: "Dock to the bottom", icon: PanelBottom },
  { value: "top", label: "Dock to the top", icon: PanelTop },
];

const CORNERS: Option<ButtonPosition>[] = [
  {
    value: "bottom-right",
    label: "Button at the bottom right",
    icon: ArrowDownRight,
  },
  {
    value: "bottom-left",
    label: "Button at the bottom left",
    icon: ArrowDownLeft,
  },
  { value: "top-right", label: "Button at the top right", icon: ArrowUpRight },
  { value: "top-left", label: "Button at the top left", icon: ArrowUpLeft },
];

const THEMES: Option<DevtoolsTheme>[] = [
  { value: "system", label: "System theme", icon: Monitor },
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
];

/** The gear button and its popover: where the panel docks, the button's corner and the theme. */
export function SettingsMenu({
  position,
  onPositionChange,
  buttonPosition,
  onButtonPositionChange,
  theme,
  onThemeChange,
}: {
  position: PanelPosition;
  onPositionChange: (position: PanelPosition) => void;
  buttonPosition: ButtonPosition;
  onButtonPositionChange: (position: ButtonPosition) => void;
  theme: DevtoolsTheme;
  onThemeChange: (theme: DevtoolsTheme) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          // The tabs bar is muted already, so hover and open need a deeper tint.
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Settings"
            className="hover:bg-foreground/10 aria-expanded:bg-foreground/10"
          />
        }
      >
        <Settings />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto gap-1.5 p-2">
        <PopoverTitle className="sr-only">Settings</PopoverTitle>
        <Setting
          label="Dock side"
          options={SIDES}
          value={position}
          onChange={onPositionChange}
        />
        <Setting
          label="Button corner"
          options={CORNERS}
          value={buttonPosition}
          onChange={onButtonPositionChange}
        />
        <Setting
          label="Theme"
          options={THEMES}
          value={theme}
          onChange={onThemeChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function Setting<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 text-xs">
      {label}
      <ToggleGroup
        aria-label={label}
        size="xs"
        spacing={1}
        value={[value]}
        onValueChange={(next: string[]) => {
          if (next[0] !== undefined) onChange(next[0] as T);
        }}
      >
        {options.map(({ value: option, label: optionLabel, icon: Icon }) => (
          <ToggleGroupItem
            key={option}
            value={option}
            aria-label={optionLabel}
            title={optionLabel}
            className="px-1 aria-pressed:text-primary"
          >
            <Icon className="size-3.5" />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
