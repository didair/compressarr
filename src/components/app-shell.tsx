"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderCog, Gauge, ListVideo, Settings, Shrink } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/directories", label: "Media", icon: FolderCog },
  { href: "/queue", label: "Queue", icon: ListVideo },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-sidebar lg:block">
        <div className="flex h-20 items-center gap-3 px-6">
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Shrink className="size-5" />
          </div>
          <div>
            <div className="font-bold tracking-tight">Compressarr</div>
            <div className="text-xs text-muted-foreground">Media optimizer</div>
          </div>
        </div>
        <nav className="space-y-1 px-3">
          {navigation.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-primary/12 text-primary",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main className="pb-20 lg:ml-64 lg:pb-0">
        <div className="mx-auto max-w-7xl space-y-7 p-4 sm:p-7 lg:p-10">{children}</div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex h-16 items-center justify-around border-t border-border bg-sidebar/95 backdrop-blur lg:hidden">
        {navigation.map((item) => {
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-w-16 flex-col items-center gap-1 text-[11px] text-muted-foreground",
                active && "text-primary",
              )}
            >
              <item.icon className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
