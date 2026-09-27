import { MenuIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { NavSection } from "@/content/types.ts";
import { Sidebar } from "./sidebar.tsx";

export function MobileNav({ nav }: { nav: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 lg:hidden"
            aria-label="Open navigation"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 overflow-y-auto p-4 pt-12">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <Sidebar nav={nav} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
