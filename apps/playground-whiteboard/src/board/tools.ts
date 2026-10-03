import {
  MousePointer2,
  MoveUpRight,
  Square,
  Type,
  type LucideIcon,
} from "lucide-react";

export type Tool = "select" | "box" | "arrow" | "text";

export interface ToolInfo {
  id: Tool;
  label: string;
  icon: LucideIcon;
  /** The key that picks the tool. */
  key: string;
}

export const TOOLS: readonly ToolInfo[] = [
  { id: "select", label: "Select and move", icon: MousePointer2, key: "V" },
  { id: "box", label: "Box", icon: Square, key: "R" },
  { id: "arrow", label: "Arrow", icon: MoveUpRight, key: "A" },
  { id: "text", label: "Text", icon: Type, key: "T" },
];
