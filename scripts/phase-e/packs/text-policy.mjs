/**
 * Engineering Phase E2A — the picture-first text rules for the guides and the review gallery.
 *
 * Pictures carry the instructions; words only support them:
 *   - inside a drawing: numbers, fractions, units and symbols only ("2 in", "≤ 1 in", "≈ 60%", "811"), never words;
 *   - under a panel: a title of at most 4 words; under a sign: a label of at most 3 words;
 *   - longer explanations live in alt text and collapsed records, never in the visible layer.
 * Pure functions, shared by the drawing kit (which refuses bad labels at draw time), the builders and the tests.
 */

export const ART_UNITS = ["in", "ft", "lb", "mph", "mi", "h", "L", "gal", "V"];
export const ART_SIGNS = ["≤", "≥", "<", ">", "≈", "×", "="];
export const TITLE_MAX_WORDS = 4;
export const TITLE_MAX_CHARS = 28;
export const SIGN_LABEL_MAX_WORDS = 3;
export const SIGN_LABEL_MAX_CHARS = 20;

const NUMBER = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?(%|°)?$/;
const FRACTION = /^((\d+-)?\d+\/\d+|\d*[½¼¾])$/;

/** True when a drawn label holds only numbers, fractions, symbols and units that follow a number. */
export function isAllowedArtText(text) {
  const tokens = String(text).trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  let sawQuantity = false;
  let previousWasQuantity = false;
  for (const token of tokens) {
    if (NUMBER.test(token) || FRACTION.test(token)) {
      sawQuantity = true;
      previousWasQuantity = true;
    } else if (ART_UNITS.includes(token)) {
      if (!previousWasQuantity) return false;
      previousWasQuantity = false;
    } else if (ART_SIGNS.includes(token)) {
      previousWasQuantity = false;
    } else {
      return false;
    }
  }
  return sawQuantity;
}

/** Words that contain letters (units after numbers count as words here, so titles stay honest). */
export function wordCount(text) {
  return String(text ?? "")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w)).length;
}

export function titleProblems(title, { maxWords = TITLE_MAX_WORDS, maxChars = TITLE_MAX_CHARS } = {}) {
  const problems = [];
  if (wordCount(title) > maxWords) problems.push(`"${title}" has more than ${maxWords} words`);
  if (String(title).length > maxChars) problems.push(`"${title}" is longer than ${maxChars} characters`);
  if (/[.!?]$/.test(String(title).trim())) problems.push(`"${title}" reads as a sentence`);
  return problems;
}

const decode = (s) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

/**
 * Words a reader sees without opening anything: strips styles, scripts and inline SVG, collapses every <details> block
 * to its <summary> (innermost first), drops any element marked data-required (licence credits, the draft badge,
 * source footers), then counts letter-words, ignoring units that follow numbers.
 */
export function visibleWords(html) {
  let s = String(html);
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  for (let previous = ""; previous !== s; ) {
    previous = s;
    s = s.replace(/<details\b(?:(?!<details\b)[\s\S])*?<\/details>/gi, (block) => ` ${block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ?? ""} `);
  }
  for (let previous = ""; previous !== s; ) {
    previous = s;
    s = s.replace(/<(\w+)\b[^>]*\bdata-required\b[^>]*>(?:(?!<\1\b)[\s\S])*?<\/\1>/gi, " ");
  }
  s = s.replace(/<img\b[^>]*>/gi, " ").replace(/<[^>]+>/g, " ");
  const tokens = decode(s).split(/\s+/).filter(Boolean);
  let count = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (!/\p{L}/u.test(tokens[i])) continue;
    const unit = tokens[i].replace(/[.,;:)]+$/, "");
    if (ART_UNITS.includes(unit) && i > 0 && /\d/.test(tokens[i - 1])) continue;
    count++;
  }
  return count;
}

/** Numbers drawn in a label, normalised for comparison with source text ("2,995" → "2995", "½" → "1/2"). */
export function numbersIn(text) {
  const out = [];
  for (const token of String(text).split(/\s+/)) {
    const t = token.replace(/[%°]$/, "");
    if (/^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/.test(t)) out.push(t.replace(/,/g, ""));
    else if (/^(\d+-)?\d+\/\d+$/.test(t)) out.push(t);
    else if (/^\d*[½¼¾]$/.test(t)) out.push(t.replace("½", "1/2").replace("¼", "1/4").replace("¾", "3/4"));
  }
  return out;
}

/** Numbers stated in source text, in the same normal form, plus the words a source uses for fractions and hours. */
export function numbersStated(text) {
  const s = String(text);
  const found = new Set();
  for (const m of s.matchAll(/(\d+-)?\d+\/\d+/g)) found.add(m[0]);
  for (const m of s.replace(/(\d+-)?\d+\/\d+/g, " ").matchAll(/(\d{1,3}(,\d{3})+|\d+)(\.\d+)?/g)) found.add(m[0].replace(/,/g, ""));
  if (/\bhalf(way)?\b/i.test(s)) found.add("1/2");
  if (/three[- ]quarter/i.test(s)) found.add("3/4");
  if (/\b(an|one|each) hour\b|\bhour of\b/i.test(s)) found.add("1");
  return found;
}
