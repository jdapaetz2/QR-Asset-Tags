import "server-only";

import { after } from "next/server";

import {
  notifySubmission,
  notifyTagRequestStatus,
  type TagStatusNotificationInput,
} from "@/lib/notifications/notify";
import type { SubmissionFormType } from "@/lib/notifications/settings";

/**
 * Phase C6 — best-effort submission notification, scheduled to run AFTER the response.
 *
 * WHY. The provider call was awaited before the renter's redirect. Measured on Production with a live
 * Resend send, `notify.send` is **178.7 ms median** (153.8-287.4 ms) against a ~1010 ms POST — about 18 %
 * of what the renter waits through. The median is not the real argument, though: the send is bounded at
 * `NOTIFICATION_TOTAL_BUDGET_MS` (15 s) across up to three attempts, and that ceiling sat on the
 * renter's SUCCESS path. A single 429 or timeout could leave someone standing at a machine watching a
 * spinner for a submission that was already safely committed.
 *
 * WHAT THIS DOES AND DOES NOT CHANGE.
 *
 * It changes WHEN the provider attempt happens. It does not change whether it may fail: the send was
 * already best-effort, `notifySubmission` already swallows every error, and `OPERATIONS_RUNBOOK.md`
 * already states that email never blocks a submission. C6 makes the latency match the semantics the
 * product already claimed.
 *
 * THE SYSTEM OF RECORD IS THE COMMITTED ROW, NOT THE EMAIL. This is the only reason deferring is
 * acceptable. The `form_submissions` insert is durable before this is ever scheduled, and the admin
 * inbox reads that row. The email is an alert about a record that already exists.
 *
 * **`after()` IS NOT A DURABLE QUEUE.** If the invocation is killed — a platform fault, or the route's
 * max duration expiring mid-send — the attempt is lost, with no retry and no dead-letter. Nothing here
 * guarantees delivery, and nothing anywhere should claim it does. A durable outbox was explicitly
 * considered and declined in `docs/EMAIL_DELIVERABILITY_RUNBOOK.md`; that decision stands, and this
 * inherits its consequence: the failure mode is a missing email beside a present submission, which the
 * admin inbox makes visible.
 *
 * WHY DEFERRAL IMPROVES THE WORST CASE RATHER THAN WORSENING IT. The 15 s budget could always collide
 * with the platform's function limit — the deliverability runbook says so explicitly. Awaited, that
 * collision turned a committed submission into a failed-looking page for the renter. Deferred, the
 * renter already has their confirmation and the only casualty is the email.
 */

/**
 * Engineering Phase D1: identifiers only. The email is built from the COMMITTED row, which `notifySubmission` loads
 * itself, so nothing the browser sent — contact details, a summary — is carried across the commit. `formType` is a
 * defensive expectation checked against the saved row, not a source of content.
 */
export type ScheduledNotification = {
  organizationId: string;
  assetId: string;
  submissionId: string;
  reference: string;
  formType: SubmissionFormType;
};

/**
 * Schedule the notification for after the response.
 *
 * MUST be called only once the insert has succeeded — the duplicate (23505) and insert-failure branches
 * return or redirect before reaching it, so a submission that does not exist can never be announced.
 *
 * Every value passed in is an immutable identifier already derived during the request — never FormData, a
 * request object, cookies, headers, media bytes or raw JSON. The callback touches no request API:
 * `notifySubmission` uses the service-role client, which reads no cookies and no headers, so the Server
 * Component restriction on `headers()`/`cookies()` inside `after` cannot be violated here.
 *
 * Returns void and never throws — `notifySubmission` catches everything internally, and the callback
 * adds no new throw of its own.
 */
export function scheduleSubmissionNotification(input: ScheduledNotification): void {
  // NOT wrapped in `time()` here. `notifySubmission` already emits `notify.send` around the provider
  // call itself (wired in C6 deploy 1), and a second wrapper would emit the same phase name for a
  // different span — the provider call in one entry, the provider call plus two admin reads in the
  // other. The before/after medians would then be comparing two different things while looking like a
  // clean A/B. One phase, one meaning, both sides.
  after(() => notifySubmission(input));
}

/**
 * Engineering Phase D3A — the tag-request status email, scheduled after a SUCCESSFUL owner save that actually changed
 * the persisted status. Same best-effort architecture as submissions: identifiers and saved values only, never
 * FormData or a request object, and the save's redirect never waits on the provider. `notifyTagRequestStatus`
 * re-checks the saved request before sending and swallows every error.
 */
export type ScheduledTagStatusNotification = TagStatusNotificationInput;

export function scheduleTagStatusNotification(input: ScheduledTagStatusNotification): void {
  after(() => notifyTagRequestStatus(input));
}
