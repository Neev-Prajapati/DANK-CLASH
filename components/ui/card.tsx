import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-white/10 bg-zinc-950/70 shadow-2xl shadow-black/30 backdrop-blur",
        className
      )}
      {...props}
    />
  );
}
