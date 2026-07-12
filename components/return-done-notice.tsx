import { returnDoneMessage } from "@/lib/submissions/returns";

/**
 * Post-action confirmation banner for "Mark returned & resolve". There is no toast
 * infrastructure — after the action redirects with `?done=`, the destination page renders
 * this quiet `role="status"` banner (rendered null when there's no `done` flag). Server
 * component; safe to place at the top of the dashboard, submissions list, and detail pages.
 */
export function ReturnDoneNotice({ done }: { done?: string | null }) {
  const message = returnDoneMessage(done);
  if (!message) return null;
  return (
    <p
      role="status"
      className="rounded-lg border border-success/30 bg-success/10 px-4 py-2.5 text-sm text-success"
    >
      {message}
    </p>
  );
}
