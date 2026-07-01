import * as React from "react";

import { cn } from "@/lib/utils";

/** Standard bordered surface — replaces the repeated `rounded-lg border bg-card p-4`. */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border bg-card p-4", className)}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-sm font-medium", className)} {...props} />;
}
