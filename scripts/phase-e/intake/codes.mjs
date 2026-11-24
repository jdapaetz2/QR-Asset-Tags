/**
 * Engineering Phase E3 — unit numbers (asset codes) in short form, shared by the fill, the check and the email drafts.
 */

/** All digits, without a leading zero: what a unit number looks like after a spreadsheet dropped its zeros. */
export const isPlainNumber = (code) => /^[1-9]\d*$/.test(String(code ?? ""));

/**
 * Unit codes in a short form for an email: consecutive numeric codes of the same width collapse into a range
 * (00101–00140), everything else is listed, in the given order.
 */
export function codeSummary(codes) {
  const out = [];
  let run = null;
  const flush = () => {
    if (!run) return;
    out.push(run.count >= 3 ? `${run.first}–${run.last}` : run.items.join(", "));
    run = null;
  };
  for (const code of codes) {
    const digits = /^\d+$/.test(code);
    if (run && digits && code.length === run.width && Number(code) === Number(run.last) + 1) {
      run.last = code;
      run.count++;
      run.items.push(code);
      continue;
    }
    flush();
    if (digits) run = { first: code, last: code, width: code.length, count: 1, items: [code] };
    else out.push(code);
  }
  flush();
  return out.join(", ");
}
