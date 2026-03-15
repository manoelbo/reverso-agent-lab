"use client";

import { cn } from "@/lib/utils";
import type { ComponentProps } from "react";

export type LoaderProps = ComponentProps<"div">;

export const Loader = ({ className, ...props }: LoaderProps) => (
  <div
    className={cn("flex items-center gap-1.5 px-1 py-2", className)}
    role="status"
    aria-label="Loading"
    {...props}
  >
    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.3s]" />
    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce [animation-delay:-0.15s]" />
    <span className="size-1.5 rounded-full bg-muted-foreground/60 animate-bounce" />
  </div>
);
