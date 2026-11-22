"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { canAccess, NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils";

export function AppSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground md:block">
      <div className="flex h-14 items-center border-b px-4 font-semibold">Mini ERP</div>
      <nav className="space-y-4 p-3">
        {NAV.map((group) => {
          const items = group.items.filter((i) => canAccess(role, i.roles));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="px-2 pb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
              {items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-sidebar-accent",
                      active && "bg-sidebar-accent font-medium",
                    )}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
