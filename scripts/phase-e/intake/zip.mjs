/**
 * Engineering Phase E3 — a small ZIP reader and writer on node:zlib, for two jobs:
 *
 *  1. Safety checks on an untrusted customer workbook before any spreadsheet library parses it: size caps, entry caps,
 *     macros, external links and ZIP64 are detected from the central directory, without unpacking anything.
 *  2. Reproducible Office files and packets: an .xlsx/.docx (or any ZIP) is rewritten with fixed timestamps, no extra
 *     fields and fixed document-property dates, so unchanged content gives byte-identical files.
 *
 * No ZIP64, no encryption, no multi-disk archives: everything the kit writes is far below those limits, and a customer
 * file that needs them is refused.
 */
import { crc32, deflateRawSync, inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

export const LIMITS = {
  workbookBytes: 25 * 1024 * 1024,
  unpackedBytes: 200 * 1024 * 1024,
  entries: 5000,
  entryBytes: 100 * 1024 * 1024,
};

function findEnd(buf) {
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === SIG_END) return i;
  throw new Error("Not a ZIP file (no end-of-central-directory record).");
}

/** Central directory entries, without reading any file data. */
export function listZip(buf) {
  const end = findEnd(buf);
  const count = buf.readUInt16LE(end + 10);
  const cdSize = buf.readUInt32LE(end + 12);
  const cdOffset = buf.readUInt32LE(end + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw new Error("ZIP64 archives are not supported.");
  if (cdOffset + cdSize > end) throw new Error("Corrupt ZIP: the central directory overlaps the end record.");
  const entries = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) throw new Error("Corrupt ZIP: bad central directory entry.");
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLength = buf.readUInt16LE(p + 28);
    const extraLength = buf.readUInt16LE(p + 30);
    const commentLength = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) throw new Error("ZIP64 entries are not supported.");
    const name = buf.subarray(p + 46, p + 46 + nameLength).toString(flags & 0x800 ? "utf8" : "latin1");
    entries.push({ name, flags, method, compressedSize, size, offset, crc: buf.readUInt32LE(p + 16) });
    p += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** The bytes of one entry, inflated, with a hard output cap (zip-bomb guard). */
export function readEntry(buf, entry, maxBytes = LIMITS.entryBytes) {
  if (buf.readUInt32LE(entry.offset) !== SIG_LOCAL) throw new Error(`Corrupt ZIP: bad local header for ${entry.name}.`);
  if (entry.flags & 0x1) throw new Error(`${entry.name} is encrypted.`);
  const start = entry.offset + 30 + buf.readUInt16LE(entry.offset + 26) + buf.readUInt16LE(entry.offset + 28);
  const raw = buf.subarray(start, start + entry.compressedSize);
  if (entry.size > maxBytes) throw new Error(`${entry.name} unpacks to ${entry.size} bytes; the limit is ${maxBytes}.`);
  let data;
  if (entry.method === 0) data = Buffer.from(raw);
  else if (entry.method === 8) data = inflateRawSync(raw, { maxOutputLength: Math.max(1, maxBytes) });
  else throw new Error(`${entry.name} uses unsupported compression method ${entry.method}.`);
  if (data.length !== entry.size) throw new Error(`${entry.name}: size mismatch after unpacking.`);
  if ((crc32(data) >>> 0) !== (entry.crc >>> 0)) throw new Error(`${entry.name}: checksum mismatch.`);
  return data;
}

export function readZip(buf, maxBytes = LIMITS.entryBytes) {
  return listZip(buf).map((e) => ({ name: e.name, data: readEntry(buf, e, maxBytes) }));
}

/**
 * Checks an untrusted .xlsx before parsing. Returns { ok, problems, notes }: problems refuse the file, notes are
 * reported (external links are never fetched, so they are noted, not refused).
 */
export function inspectWorkbookZip(buf) {
  const problems = [];
  const notes = [];
  if (buf.length > LIMITS.workbookBytes) problems.push(`The workbook is ${buf.length} bytes; the limit is ${LIMITS.workbookBytes}.`);
  let entries = [];
  try {
    entries = listZip(buf);
  } catch (error) {
    problems.push(`Not a readable .xlsx file: ${error.message}`);
    return { ok: false, problems, notes };
  }
  if (entries.length > LIMITS.entries) problems.push(`The workbook has ${entries.length} parts; the limit is ${LIMITS.entries}.`);
  const unpacked = entries.reduce((sum, e) => sum + e.size, 0);
  if (unpacked > LIMITS.unpackedBytes) problems.push(`The workbook unpacks to ${unpacked} bytes; the limit is ${LIMITS.unpackedBytes}.`);
  for (const e of entries) {
    if (e.size > LIMITS.entryBytes) problems.push(`${e.name} unpacks to ${e.size} bytes; the limit is ${LIMITS.entryBytes}.`);
    if (e.compressedSize > 0 && e.size / e.compressedSize > 200 && e.size > 10 * 1024 * 1024) problems.push(`${e.name} has a suspicious compression ratio.`);
  }
  const names = entries.map((e) => e.name.toLowerCase());
  if (names.some((n) => n.endsWith("vbaproject.bin") || n.includes("/macrosheets/") || n.includes("/activex/"))) problems.push("The workbook contains macros. Save it as a normal .xlsx workbook and send it again.");
  if (names.some((n) => n.startsWith("xl/externallinks/"))) notes.push("The workbook links to other workbooks. The links were ignored and never opened.");
  if (!names.includes("xl/workbook.xml")) problems.push("This is not an Excel workbook (.xlsx).");
  return { ok: problems.length === 0, problems, notes };
}

// ------------------------------------------------------------------------------------------------ writing

function dosDateTime(date) {
  const d = new Date(date);
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | Math.floor(d.getUTCSeconds() / 2);
  const day = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  return { time, day };
}

/**
 * Write a ZIP from [{ name, data }] in the given order: deflate (level 9) unless storing is smaller, fixed timestamps,
 * UTF-8 names, no extra fields or comments. Same input, same bytes.
 */
export function writeZip(files, { date }) {
  const { time, day } = dosDateTime(date);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const crc = crc32(data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(SIG_LOCAL, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(SIG_CENTRAL, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(SIG_END, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/**
 * Rewrite an Office file (.xlsx/.docx) reproducibly: same parts in the same order, document-property dates fixed,
 * folder entries dropped (Word has refused files with them when opened through cloud co-editing).
 */
export function normalizeOoxml(buf, { date }) {
  const stamp = new Date(date).toISOString().replace(/\.\d{3}Z$/, "Z");
  const files = readZip(buf)
    .filter((f) => !f.name.endsWith("/"))
    .map((f) => {
      if (f.name !== "docProps/core.xml") return f;
      const xml = f.data
        .toString("utf8")
        .replace(/(<dcterms:(?:created|modified)\b[^>]*>)[^<]*(<\/dcterms:(?:created|modified)>)/g, `$1${stamp}$2`)
        .replace(/(<cp:lastPrinted>)[^<]*(<\/cp:lastPrinted>)/g, `$1${stamp}$2`);
      return { name: f.name, data: Buffer.from(xml, "utf8") };
    });
  return writeZip(files, { date });
}
