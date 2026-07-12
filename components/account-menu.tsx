"use client";

import { useRef } from "react";
import { DropdownMenu } from "radix-ui";

import { signOut } from "@/lib/auth/actions";
import { roleLabel } from "@/lib/auth/roles";
import { initialsFrom } from "@/lib/auth/name";

/**
 * Compact account control: an initials avatar that opens an anchored dropdown with
 * the signed-in identity, role, and Sign out. The menu is portaled to <body>, so it
 * can never be clipped by the nameplate band's overflow/stacking, and it closes on
 * outside-click / Escape.
 *
 * Sign out uses the existing `signOut` server action. The menu item's `onSelect`
 * calls `preventDefault()` (so Radix does NOT close + unmount the portaled form before
 * the submit fires — that swallowed the click before) and then `requestSubmit()`s the
 * hidden form, which invokes the server action. The action clears the Supabase session
 * and redirects to /login, which tears the menu down. Works for pointer and keyboard.
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
  const signOutFormRef = useRef<HTMLFormElement>(null);

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
          <DropdownMenu.Item
            onSelect={(e) => {
              // Keep the portaled form mounted through submission; the server action
              // redirects to /login, which then closes the menu.
              e.preventDefault();
              signOutFormRef.current?.requestSubmit();
            }}
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground"
          >
            Sign out
          </DropdownMenu.Item>
          <form ref={signOutFormRef} action={signOut} className="hidden" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
