"use client";

import { DropdownMenu } from "radix-ui";

import { signOut } from "@/lib/auth/actions";
import { roleLabel } from "@/lib/auth/roles";
import { initialsFrom } from "@/lib/auth/name";

/**
 * Compact account control: an initials avatar that opens an anchored dropdown with
 * the signed-in identity, role, and Sign out. The menu is portaled to <body>, so it
 * can never be clipped by the nameplate band's overflow/stacking, and it closes on
 * outside-click / Escape. Sign out preserves the existing server-action form.
 */
export function AccountMenu({
  name,
  email,
  role,
}: {
  name: string | null;
  email: string | null;
  role: string;
}) {
  const initials = initialsFrom(name, email);
  const display = name ?? email ?? "Signed in";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label="Account menu"
        className="flex size-8 items-center justify-center rounded-full border bg-muted text-xs font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {initials}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[200px] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <div className="px-2 py-1.5">
            <div className="truncate text-sm font-medium">{display}</div>
            <div className="text-xs text-muted-foreground">{roleLabel(role)}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <form action={signOut}>
            <DropdownMenu.Item asChild>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
              >
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
