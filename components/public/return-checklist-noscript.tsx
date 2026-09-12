import { returnChecklistNoScriptHtml, type ReturnNoScriptInput } from "@/lib/public/return-noscript";

/**
 * Without JavaScript the guided return checklist cannot post its answers, so the public return page shows this notice
 * instead of the form (lib/public/return-noscript.ts builds the markup). With JavaScript `<noscript>` is inert and the
 * checklist works as usual. Rendered only on the public return page.
 */
export function ReturnChecklistNoScript(props: ReturnNoScriptInput) {
  return <noscript dangerouslySetInnerHTML={{ __html: returnChecklistNoScriptHtml(props) }} />;
}
