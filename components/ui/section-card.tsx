import * as React from "react";

import { cn } from "@/lib/utils";
import { Card, CardTitle } from "@/components/ui/card";

/**
 * SectionCard — a titled content card. Consolidates the repeated
 * "card surface + heading + optional description + optional right-aligned action"
 * pattern used across settings and tag-request pages, so those surfaces read as one
 * system instead of ad-hoc `border-t` section stacks. Presentational only.
 */
export function SectionCard({
  id,
  title,
  description,
  actions,
  children,
  className,
  contentClassName,
}: {
  /** Optional anchor id so an in-page section index can link to this card. */
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card id={id} className={cn("flex flex-col gap-4 scroll-mt-20", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("flex flex-col gap-3", contentClassName)}>{children}</div>
    </Card>
  );
}
