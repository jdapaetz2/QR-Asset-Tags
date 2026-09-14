/**
 * Test helper: the visible text of an email's HTML part, normalized so it can be compared with the plain-text part.
 *
 * The HTML sets a label and its value in separate cells ("Photos" / "none") where the text part writes "Photos: none",
 * and bullets are "•" cells where the text writes "- ". `normalizeFact` applies the same folding to both sides: a colon
 * followed by whitespace becomes a space, "•" becomes "-", and runs of whitespace collapse.
 */
export function normalizeFact(value: string): string {
  return value.replace(/•/g, "-").replace(/:\s+/g, " ").replace(/\s+/g, " ").trim();
}

/** One normalized entry per block-level line of visible HTML (head, Outlook conditional comments and tags removed). */
export function visibleHtmlLines(html: string): string[] {
  return html
    .replace(/<head>[\s\S]*?<\/head>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br>|<\/(?:div|td|tr|table|p)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .split("\n")
    .map(normalizeFact)
    .filter((line) => line.length > 0);
}

export function visibleHtml(html: string): string {
  return visibleHtmlLines(html).join(" ");
}
