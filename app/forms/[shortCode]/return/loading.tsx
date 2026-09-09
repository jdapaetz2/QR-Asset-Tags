import { PublicFormLoading } from "@/components/public/public-form-loading";

/**
 * Phase C8. Added to the three FORM routes only — never to their `/thanks` children, which render no
 * remote data and were not measured as waiting. A skeleton on an already-instant route is a flicker.
 */
export default function Loading() {
  return <PublicFormLoading />;
}
