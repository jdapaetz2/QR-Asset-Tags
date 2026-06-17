"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth/session";
import { isSubmissionStatus } from "@/lib/submissions/display";

export type SubmissionActionState = { error?: string };

/**
 * Update a submission's status. RLS (`form_submissions_rw`) limits this to the
 * caller's own organization — a cross-org id updates 0 rows. No service-role.
 */
export async function setSubmissionStatus(
  submissionId: string,
  _prev: SubmissionActionState,
  formData: FormData
): Promise<SubmissionActionState> {
  const status = formData.get("status");
  if (!isSubmissionStatus(status)) {
    return { error: "Invalid status." };
  }

  await requireProfile();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("form_submissions")
    .update({ status })
    .eq("id", submissionId)
    .select("id")
    .maybeSingle();

  if (error) return { error: "Could not update the status." };
  if (!data) return { error: "Submission not found." };

  redirect(`/dashboard/submissions/${submissionId}`);
}
