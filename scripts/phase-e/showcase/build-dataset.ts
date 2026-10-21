/**
 * Engineering Phase E2B — the deterministic builder of the synthetic Northridge showcase history.
 *
 * Pure: (scenario, media map, previous dataset, anchor) -> dataset. No I/O, no clock. Run it with
 * `npm run phase-e:showcase:build` (vitest, so the app's own TypeScript modules and `@/` imports load); `npm test`
 * rebuilds it in memory and fails when the tracked docs/phase-e/showcase/dataset.json is out of date.
 *
 * Every stored shape comes from the app's real code: inspection answers go through parseAnswerValues ->
 * evaluateInspection -> deriveFlags -> resolvePhotoEvidence -> buildReturnSubmissionData with the same template the
 * live path resolves (outbound, staff return without the attestation, renter return); staff-return status through
 * staffReturnStatus; damage and support data through captureDamageReport / captureSupportRequest and their validators;
 * acknowledgements through validateAcknowledgement with the app's statement; scan device types through
 * deviceTypeFromUserAgent; media paths through submissionPathPrefix / mediaObjectName. Timestamps follow the RPCs'
 * order (the outbound row is stamped seconds before its session opens, the staff return seconds before the session
 * closes, mark_return_and_resolve closes the session when the admin clicks). Randomness is a seeded PRNG per purpose;
 * ids are random v4 values drawn once and pinned by logical key in the dataset itself, so a rebuild keeps them.
 */
import { createHash, randomUUID } from "node:crypto";

import { ACKNOWLEDGEMENT_STATEMENT, validateAcknowledgement } from "@/lib/acknowledgements/acknowledgements";
import { mediaObjectName, submissionPathPrefix } from "@/lib/forms/media";
import { captureDamageReport, captureSupportRequest } from "@/lib/forms/triage-capture";
import { validateDamageReport, validateSupportRequest } from "@/lib/forms/validate";
import { resolveOutboundTemplate } from "@/lib/inspections/outbound-templates";
import { resolveReturnTemplate } from "@/lib/inspections/resolve";
import { buildReturnSubmissionData } from "@/lib/inspections/snapshot";
import { resolveStaffReturnTemplate } from "@/lib/inspections/staff-return-templates";
import { DAMAGE_PHOTOS_SLOT_ID } from "@/lib/inspections/templates";
import type { InspectionField, InspectionTemplate, PhotoAnswer } from "@/lib/inspections/types";
import {
  buildAnswers,
  deriveFlags,
  evaluateInspection,
  parseAnswerValues,
  resolvePhotoEvidence,
  visiblePhotoSlots,
} from "@/lib/inspections/validate";
import { deviceTypeFromUserAgent, hashIp } from "@/lib/scan/scan";
import { submissionReference } from "@/lib/submissions/inbox";
import { rentalSessionRef } from "@/lib/timeline/timeline";
import { staffReturnStatus } from "@/lib/submissions/returns";
import { TRIAGE_FIELDS, TRIAGE_VERSION, TRIAGE_VERSION_FIELD } from "@/lib/submissions/triage";

import { pacificWallTimeToUtc } from "../../lib/showcase-reset.mjs";

export const DATASET_SCHEMA = "mulemark.phase-e.showcase-dataset/v1";
const SCAN_HASH_SALT = "phase-e-e2b-showcase";
const MIN = 60_000;

// ---------------------------------------------------------------------------------------------------------------------
// Scenario and dataset shapes
// ---------------------------------------------------------------------------------------------------------------------

type Weights = Record<string, number>;
type DayTime = { day: number; at: string };
type Answers = Record<string, string | number | Record<string, string>>;

type FinalSpec = {
  key: string;
  renter: string;
  out: DayTime;
  back?: DayTime;
  outbound?: { staff: string; photos: string[] };
  acknowledgement?: DayTime;
  renter_return?: DayTime & { photos: string[] };
  close?: { mode: "staff"; staff: string; photos: string[]; damage_photos?: string[]; answers?: Answers; status?: string };
  story?: string;
};

type AssetSpec = {
  asset_code: string;
  asset_id: string;
  qr_link_id: string;
  short_code: string;
  model: string;
  category: string;
  template_key: string;
  not_before: string;
  kind: "excavator" | "trailer";
  completed_rentals: number;
  same_day_rentals: number;
  duration_days: Weights;
  start_weekday_weight: Weights;
  rates: { outbound: number; acknowledgement: number; staff_return: number; renter_return: number };
  meter: { start_hours: number; hours_per_rental_day: [number, number] } | null;
  photos: Record<string, string>;
  photo_rates: Record<"outbound" | "staff_return" | "renter_return", Weights>;
  accessories: { outbound: Record<string, string>; return: Record<string, string> };
  final: FinalSpec[];
};

type IncidentSpec = {
  key: string;
  asset: string;
  session: string | { near_day: number };
  form: "damage_report" | "support_request" | "staff_return_flag";
  at?: DayTime;
  late?: boolean;
  triage?: Record<string, string>;
  renter?: string;
  description?: string;
  photos?: string[];
  staff_photos?: string[];
  damage_photos?: string[];
  answers?: Answers;
  status: string;
  story?: string;
};

type Person = { key: string; name: string; email: string | null; phone?: string | null; device: string };
type Renter = Person & { company: string | null; phone: string | null; crew: number; assets: Weights };

export type Scenario = {
  schema: string;
  scenario_id: string;
  version: string;
  seed: number;
  time_zone: string;
  anchor: { date: string; local_hour: number };
  history_days: number;
  event_hours: { earliest: string; latest: string };
  organization_id: string;
  labels: { rental_reference_prefix: string; first_contract_number: number; acknowledgement_name_suffix: string };
  rates_target: {
    outbound: number;
    acknowledgement: number;
    staff_return: number;
    renter_return: number;
    damage_reports: number;
    support_requests: number;
    open_at_anchor: { new: number; reviewed: number };
    scans_total: number;
  };
  staff: (Person & { role: string })[];
  staff_rules: { weekday: string; weekend: string; weekday_after_16_luis_share: number };
  devices: Record<string, { user_agent: string; network?: string }>;
  visitor_devices: Weights;
  renters: Renter[];
  assets: AssetSpec[];
  incidents: IncidentSpec[];
  closing_mix: {
    renter_return_then_admin_mark_share: number;
    admin_mark_delay_minutes: [number, number];
    after_hours_dropoff_share: number;
    renter_return_before_staff_minutes: [number, number];
  };
  scans: {
    target_total: number;
    tolerance: number;
    staff_scan_before_action_minutes: [number, number];
    renter_scan_before_action_minutes: [number, number];
    first_day_scans: Record<"excavator" | "trailer", Weights>;
    later_day_scans: Record<"excavator" | "trailer", Weights>;
    idle_hours: [string, string];
    idle_weekday_weight: Weights;
  };
  text: {
    deck_notes_staff: string[];
    deck_notes_renter: string[];
    deck_notes_rate: { staff_return: number; renter_return: number };
  };
};

export type MediaItem = { key: string; file: string; asset_code: string; content_type: string; bytes: number; sha256: string; used_for: string[] };
export type MediaMap = { items: MediaItem[] };

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Row = { [column: string]: Json };

export type Dataset = {
  schema: string;
  scenario: { id: string; version: string; seed: number; sha256: string };
  anchor: { date: string; time_zone: string; local: string; utc: string };
  history_start_utc: string;
  organization_id: string;
  assets: { asset_code: string; asset_id: string; qr_link_id: string; short_code: string; active_rental_session_id: string | null }[];
  templates: Record<string, Json>;
  rows: { asset_rental_sessions: Row[]; asset_acknowledgements: Row[]; form_submissions: Row[]; scan_events: Row[] };
  objects: { bucket: string; path: string; media: string; content_type: string; bytes: number; sha256: string }[];
  stories: Record<string, Json>;
  summary: Record<string, Json>;
  pinned_ids: PinnedId[];
  /** Ids an earlier dataset version owned and this one no longer does (cumulative): a refresh deletes them. */
  retired_ids: PinnedId[];
};

export type PinnedId = { key: string; id: string; table: string };

// ---------------------------------------------------------------------------------------------------------------------
// Randomness, time and ids
// ---------------------------------------------------------------------------------------------------------------------

/** mulberry32 seeded from sha256(seed:label): one independent stream per purpose, so editing one part moves nothing else. */
class Rand {
  private state: number;
  constructor(seed: number, label: string) {
    this.state = createHash("sha256").update(`${seed}:${label}`).digest().readUInt32LE(0);
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  weighted(weights: Weights): string {
    const entries = Object.entries(weights).filter(([, w]) => w > 0);
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let r = this.next() * total;
    for (const [key, w] of entries) {
      if ((r -= w) < 0) return key;
    }
    return entries[entries.length - 1][0];
  }
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** Postgres's own text form of a UTC timestamptz with whole seconds, so a re-read compares equal. */
export const pgTime = (d: Date) => {
  if (d.getUTCMilliseconds() !== 0) throw new Error(`timestamp ${d.toISOString()} has milliseconds`);
  return d.toISOString().replace(/\.000Z$/, "+00:00");
};

const LOCAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Vancouver",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function localParts(d: Date) {
  const p = Object.fromEntries(LOCAL.formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

class Clock {
  readonly y: number;
  readonly m: number;
  readonly d: number;
  readonly anchor: Date;
  constructor(date: string, hour: number) {
    const [y, m, d] = date.split("-").map(Number);
    if (!y || !m || !d) throw new Error(`anchor date ${date} is not YYYY-MM-DD`);
    this.y = y;
    this.m = m;
    this.d = d;
    this.anchor = pacificWallTimeToUtc(y, m, d, hour);
  }
  private day(offset: number) {
    const t = new Date(Date.UTC(this.y, this.m - 1, this.d + offset));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), dow: t.getUTCDay() };
  }
  weekday(offset: number): string {
    return WEEKDAYS[this.day(offset).dow];
  }
  isWeekend(offset: number): boolean {
    const w = this.day(offset).dow;
    return w === 0 || w === 6;
  }
  /** Local wall time (minutes after midnight) on day `offset`, plus whole seconds. */
  at(offset: number, minutes: number, seconds = 0): Date {
    const { y, m, d } = this.day(offset);
    const h = Math.floor(minutes / 60);
    return new Date(pacificWallTimeToUtc(y, m, d, h).getTime() + (minutes - h * 60) * MIN + seconds * 1000);
  }
  dt(spec: DayTime, seconds = 0): Date {
    return this.at(spec.day, toMinutes(spec.at), seconds);
  }
}

const REF_TABLES = new Set(["asset_rental_sessions", "form_submissions"]);

/** Ids pinned by logical key; new ones random v4, redrawn while their display reference (table, UTC year, 6 hex) collides. */
class IdKeeper {
  private known: Map<string, string>;
  private used = new Map<string, string>();
  private refs = new Set<string>();
  readonly pinned: PinnedId[] = [];
  constructor(previous: { key: string; id: string }[], private readonly draw: () => string) {
    this.known = new Map(previous.map((p) => [p.key, p.id]));
  }
  get(key: string, table: string, createdAt: Date): string {
    if (this.used.has(key)) throw new Error(`logical key ${key} issued twice`);
    const refKey = (id: string) => `${table}:${createdAt.getUTCFullYear()}:${id.slice(0, 6)}`;
    let id = this.known.get(key);
    if (id) {
      if (REF_TABLES.has(table) && this.refs.has(refKey(id))) throw new Error(`pinned id of ${key} now shares its display reference with another row; drop the pin to redraw`);
    } else {
      do id = this.draw();
      while (REF_TABLES.has(table) && this.refs.has(refKey(id)));
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) throw new Error(`${key}: ${id} is not a lowercase v4 uuid`);
    if (REF_TABLES.has(table)) this.refs.add(refKey(id));
    this.used.set(key, id);
    this.pinned.push({ key, id, table });
    return id;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------------

type Closing = "staff" | "renter_mark" | "admin_end";

type Session = {
  key: string;
  asset: AssetSpec;
  final: FinalSpec | null;
  outDay: number;
  backDay: number | null;
  outMin: number;
  backMin: number | null;
  renter: Renter;
  outbound: boolean;
  outboundStaff: string | null;
  ack: boolean;
  closing: Closing | null;
  renterReturn: boolean;
  incidents: IncidentSpec[];
  flag: IncidentSpec | null;
  // Times, filled in later.
  outboundAt?: Date;
  startedAt?: Date;
  ackAt?: Date;
  renterReturnAt?: Date;
  staffReturnAt?: Date;
  returnedAt?: Date;
  closeStaff?: string;
  hoursOut?: number;
  hoursBack?: number;
};

type Plan = { sessions: Session[]; bySession: Map<string, Session> };

function plan(scenario: Scenario, clock: Clock): Plan {
  const sessions: Session[] = [];
  const renters = new Map(scenario.renters.map((r) => [r.key, r]));
  const renter = (key: string) => {
    const r = renters.get(key);
    if (!r) throw new Error(`unknown renter ${key}`);
    return r;
  };
  for (const asset of scenario.assets) {
    const rand = new Rand(scenario.seed, `layout:${asset.asset_code}`);
    const finals = asset.final.map((f) => ({
      f,
      outDay: f.out.day,
      backDay: f.back ? f.back.day : null,
    }));
    const finalCompleted = finals.filter((x) => x.backDay !== null);
    const bulkCount = asset.completed_rentals - finalCompleted.length;
    const sameDayBulk = asset.same_day_rentals - finalCompleted.filter((x) => x.backDay === x.outDay).length;
    if (bulkCount < 0 || sameDayBulk < 0 || sameDayBulk > bulkCount) throw new Error(`${asset.asset_code}: inconsistent rental counts`);
    const startDay = -scenario.history_days;
    const endDay = Math.min(...finals.map((x) => x.outDay)) - 2;

    // Durations, then the slack (idle days) spread over the gaps, then a weekday-preference shift within each gap.
    const sameDay = rand.shuffle(Array.from({ length: bulkCount }, (_, i) => i < sameDayBulk));
    const durations = sameDay.map((same) => (same ? 0 : Number(rand.weighted(asset.duration_days))));
    const occupied = durations.reduce((n, d) => n + d + 1, 0);
    const slack = endDay - startDay + 1 - occupied;
    if (slack < 0) throw new Error(`${asset.asset_code}: ${bulkCount} rentals do not fit in ${scenario.history_days} days`);
    const weights = Array.from({ length: bulkCount + 1 }, () => -Math.log(1 - rand.next()));
    const total = weights.reduce((a, b) => a + b, 0);
    const gaps = weights.map((w) => Math.floor((w / total) * slack));
    for (let left = slack - gaps.reduce((a, b) => a + b, 0); left > 0; left--) gaps[rand.int(0, gaps.length - 1)]++;
    for (let i = 0; i < bulkCount; i++) {
      let s = startDay + gaps.slice(0, i + 1).reduce((a, b) => a + b, 0) + durations.slice(0, i).reduce((n, d) => n + d + 1, 0);
      const options: Weights = {};
      for (let delta = -Math.min(3, gaps[i]); delta <= Math.min(3, gaps[i + 1]); delta++) {
        const w = asset.start_weekday_weight[clock.weekday(s + delta)] ?? 0;
        if (w > 0) options[String(delta)] = w / (1 + 0.5 * Math.abs(delta));
      }
      const delta = Object.keys(options).length ? Number(rand.weighted(options)) : 0;
      gaps[i] += delta;
      gaps[i + 1] -= delta;
      s += delta;
    }
    let cursor = startDay;
    const bulk: Session[] = [];
    for (let i = 0; i < bulkCount; i++) {
      cursor += gaps[i];
      const outDay = cursor;
      const backDay = outDay + durations[i];
      cursor = backDay + 1;
      const weekend = clock.isWeekend(outDay);
      const outMin =
        durations[i] === 0
          ? rand.int(toMinutes("08:00"), toMinutes("11:00"))
          : asset.kind === "excavator"
            ? rand.int(toMinutes(weekend ? "07:30" : "07:00"), toMinutes("09:30"))
            : rand.int(toMinutes("07:30"), toMinutes("11:30"));
      const backMin = rand.int(toMinutes("15:00"), toMinutes("18:00"));
      bulk.push({
        key: `session:${asset.asset_code}:${i + 1}`,
        asset,
        final: null,
        outDay,
        backDay,
        outMin,
        backMin,
        renter: scenario.renters[0],
        outbound: false,
        outboundStaff: null,
        ack: false,
        closing: null,
        renterReturn: false,
        incidents: [],
        flag: null,
      });
    }
    const finalSessions: Session[] = asset.final.map((f) => ({
      key: `session:${asset.asset_code}:final:${f.key}`,
      asset,
      final: f,
      outDay: f.out.day,
      backDay: f.back ? f.back.day : null,
      outMin: toMinutes(f.out.at),
      backMin: f.back ? toMinutes(f.back.at) : null,
      renter: renter(f.renter),
      outbound: Boolean(f.outbound),
      outboundStaff: f.outbound?.staff ?? null,
      ack: Boolean(f.acknowledgement),
      closing: f.back ? (f.close?.mode ?? "staff") : null,
      renterReturn: Boolean(f.renter_return),
      incidents: [],
      flag: null,
    }));
    const own = [...bulk, ...finalSessions];

    // Incidents bind to their session: a named final session, or the free bulk session that returned nearest the day.
    for (const incident of scenario.incidents.filter((i) => i.asset === asset.asset_code)) {
      let target: Session | undefined;
      if (typeof incident.session === "string") {
        target = finalSessions.find((s) => s.final?.key === incident.session);
      } else {
        const near = incident.session.near_day;
        target = bulk
          .filter((s) => s.incidents.length === 0 && !s.flag)
          .sort((a, b) => Math.abs((a.backDay ?? 0) - near) - Math.abs((b.backDay ?? 0) - near) || a.outDay - b.outDay)[0];
      }
      if (!target) throw new Error(`incident ${incident.key}: no session to attach to`);
      if (incident.form === "staff_return_flag") {
        target.flag = incident;
        target.closing = "staff";
      } else target.incidents.push(incident);
      if (incident.renter) {
        if (target.final && target.final.renter !== incident.renter) throw new Error(`incident ${incident.key}: renter differs from its final session`);
        if (!(renter(incident.renter).assets[asset.asset_code] > 0)) throw new Error(`incident ${incident.key}: renter never rents ${asset.asset_code}`);
        target.renter = renter(incident.renter);
      }
    }

    // Renters for the remaining bulk sessions, by affinity, avoiding the same customer twice in a row.
    const pool: Weights = Object.fromEntries(scenario.renters.filter((r) => (r.assets[asset.asset_code] ?? 0) > 0).map((r) => [r.key, r.assets[asset.asset_code]]));
    const rrand = new Rand(scenario.seed, `renters:${asset.asset_code}`);
    let previous: string | null = null;
    for (const s of bulk) {
      const bound = s.incidents.some((i) => i.renter) || Boolean(s.flag?.renter);
      if (!bound) {
        let pick = rrand.weighted(pool);
        if (pick === previous) pick = rrand.weighted(pool);
        s.renter = renter(pick);
      }
      previous = s.renter.key;
    }

    // Exact allocation of the rates per asset (forced ones first).
    const arand = new Rand(scenario.seed, `attributes:${asset.asset_code}`);
    const completed = own.filter((s) => s.backDay !== null);
    const allocate = (target: number, pool2: Session[], forced: number, label: string): Session[] => {
      const need = target - forced;
      if (need < 0 || need > pool2.length) throw new Error(`${asset.asset_code}: cannot allocate ${label} (${target} wanted, ${forced} forced, ${pool2.length} free)`);
      return arand.shuffle(pool2).slice(0, need);
    };
    const outTarget = Math.round(asset.rates.outbound * own.length);
    for (const s of allocate(outTarget, bulk, finalSessions.filter((s) => s.outbound).length, "outbound")) s.outbound = true;
    const ackTarget = Math.round(asset.rates.acknowledgement * own.length);
    for (const s of allocate(ackTarget, bulk, finalSessions.filter((s) => s.ack).length, "acknowledgements")) s.ack = true;
    const staffTarget = Math.round(asset.rates.staff_return * completed.length);
    const forcedStaff = completed.filter((s) => s.closing === "staff");
    for (const s of allocate(staffTarget, bulk.filter((s) => s.closing === null), forcedStaff.length, "staff returns")) s.closing = "staff";
    const others = arand.shuffle(bulk.filter((s) => s.closing === null));
    const markCount = Math.round(scenario.closing_mix.renter_return_then_admin_mark_share * others.length);
    others.forEach((s, i) => {
      s.closing = i < markCount ? "renter_mark" : "admin_end";
      if (s.closing === "renter_mark") s.renterReturn = true;
    });
    const renterTarget = Math.round(asset.rates.renter_return * completed.length);
    const forcedRenter = completed.filter((s) => s.renterReturn).length;
    for (const s of allocate(renterTarget, bulk.filter((s) => s.closing === "staff" && !s.renterReturn), forcedRenter, "renter returns")) s.renterReturn = true;

    sessions.push(...own.sort((a, b) => a.outDay - b.outDay || a.outMin - b.outMin));
  }
  return { sessions, bySession: new Map(sessions.map((s) => [s.key, s])) };
}

function staffFor(scenario: Scenario, clock: Clock, day: number, minutes: number, rand: Rand): string {
  if (clock.isWeekend(day)) return scenario.staff_rules.weekend;
  if (minutes >= 16 * 60 && rand.chance(scenario.staff_rules.weekday_after_16_luis_share)) return scenario.staff_rules.weekend;
  return scenario.staff_rules.weekday;
}

/** Concrete timestamps for every session, in the order the app's actions stamp them. */
function schedule(scenario: Scenario, clock: Clock, p: Plan) {
  const byAsset = new Map<string, Session[]>();
  for (const s of p.sessions) byAsset.set(s.asset.asset_code, [...(byAsset.get(s.asset.asset_code) ?? []), s]);
  for (const [code, list] of byAsset) {
    const rand = new Rand(scenario.seed, `times:${code}`);
    let hours = list[0].asset.meter?.start_hours ?? 0;
    list.forEach((s, index) => {
      const next = list[index + 1];
      const sec = () => rand.int(0, 59);
      if (s.outbound) {
        s.outboundStaff ??= staffFor(scenario, clock, s.outDay, s.outMin, rand);
        s.outboundAt = clock.at(s.outDay, s.outMin, sec());
        s.startedAt = new Date(s.outboundAt.getTime() + rand.int(3, 9) * 1000);
      } else {
        s.startedAt = clock.at(s.outDay, s.outMin, sec());
      }
      if (s.ack) {
        s.ackAt = s.final?.acknowledgement
          ? clock.dt(s.final.acknowledgement, sec())
          : new Date(s.startedAt.getTime() + rand.int(12, 55) * MIN + rand.int(0, 59) * 1000);
      }
      if (s.asset.meter) {
        hours = round1(hours + rand.int(0, 3) / 10);
        s.hoursOut = hours;
        if (s.backDay !== null) {
          const days = s.backDay - s.outDay || 0.6;
          const [lo, hi] = s.asset.meter.hours_per_rental_day;
          hours = round1(hours + days * (lo + rand.next() * (hi - lo)));
          s.hoursBack = hours;
        }
      }
      if (s.backDay === null || s.backMin === null) return;
      const back = clock.at(s.backDay, s.backMin, sec());
      if (s.closing === "staff") {
        s.closeStaff = s.final?.close?.staff ?? staffFor(scenario, clock, s.backDay, s.backMin, rand);
        s.staffReturnAt = back;
        s.returnedAt = new Date(back.getTime() + rand.int(4, 14) * 1000);
        if (s.renterReturn) {
          s.renterReturnAt = s.final?.renter_return
            ? clock.dt(s.final.renter_return, sec())
            : new Date(back.getTime() - rand.int(...scenario.closing_mix.renter_return_before_staff_minutes) * MIN - rand.int(0, 59) * 1000);
        }
      } else if (s.closing === "renter_mark") {
        // An after-hours drop-off is marked returned the next morning, which must leave two hours before the next rental.
        const nextMorningFree = !next || next.outDay > s.backDay + 1 || next.outMin >= toMinutes("10:30");
        if (nextMorningFree && rand.chance(scenario.closing_mix.after_hours_dropoff_share)) {
          s.renterReturnAt = clock.at(s.backDay, rand.int(toMinutes("18:40"), toMinutes("20:30")), sec());
          s.returnedAt = clock.at(s.backDay + 1, rand.int(toMinutes("07:35"), toMinutes("08:20")), sec());
        } else {
          s.renterReturnAt = back;
          const [lo, hi] = scenario.closing_mix.admin_mark_delay_minutes;
          // The admin clicks "Mark returned & resolve" later the same working day.
          s.returnedAt = new Date(back.getTime() + rand.int(lo, Math.max(lo, Math.min(hi, toMinutes("18:45") - s.backMin))) * MIN + rand.int(0, 59) * 1000);
        }
      } else {
        s.returnedAt = back;
      }
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Inspections (the app's real functions)
// ---------------------------------------------------------------------------------------------------------------------

type InspectionKind = "outbound" | "staff-return" | "return";

function templateFor(kind: InspectionKind, asset: AssetSpec): InspectionTemplate {
  const input = { assignmentKey: asset.template_key, category: asset.category };
  if (kind === "outbound") return resolveOutboundTemplate(input);
  if (kind === "staff-return") return resolveStaffReturnTemplate(input);
  return resolveReturnTemplate(input);
}

const templateRef = (kind: InspectionKind, t: InspectionTemplate) => `${kind}:${t.key}:${t.version}`;

function fuelAfter(usage: number): string {
  if (usage < 6) return "3/4";
  if (usage < 13) return "1/2";
  return "1/4";
}

/** The raw form answers a person would post for this inspection; parsed by the app's own parser afterwards. */
function formAnswers(kind: InspectionKind, template: InspectionTemplate, s: Session, overrides: Answers, rand: Rand, scenario: Scenario): Map<string, string> {
  const posted = new Map<string, string>();
  const isRenter = kind === "return";
  for (const section of template.sections) {
    for (const field of section.fields) {
      const id = field.id;
      const o = overrides[id];
      switch (field.type) {
        case "pass_fail_na":
          posted.set(`answer:${id}`, typeof o === "string" ? o : "pass");
          break;
        case "yes_no":
          posted.set(`answer:${id}`, typeof o === "string" ? o : id === "ramps_gate" ? "yes" : "no");
          break;
        case "numeric_meter": {
          const value = kind === "outbound" ? s.hoursOut : s.hoursBack;
          if (value !== undefined && (!isRenter || rand.chance(0.5))) posted.set(`answer:${id}`, String(isRenter && rand.chance(0.4) ? round1(value - 0.1) : value));
          break;
        }
        case "fuel_charge_level":
          if (kind === "outbound") posted.set(`answer:${id}`, "Full");
          else if (s.hoursOut !== undefined && s.hoursBack !== undefined && (!isRenter || rand.chance(0.7))) posted.set(`answer:${id}`, fuelAfter(s.hoursBack - s.hoursOut));
          break;
        case "select":
          if (typeof o === "string") posted.set(`answer:${id}`, o);
          else if (id === "bucket_attachment") posted.set(`answer:${id}`, "standard_bucket");
          break;
        case "accessory_checklist": {
          if (isRenter && rand.chance(0.2)) break;
          const base = kind === "outbound" ? s.asset.accessories.outbound : s.asset.accessories.return;
          const extra = (typeof o === "object" && o ? o : {}) as Record<string, string>;
          for (const item of field.items ?? []) {
            const v = extra[item.id] ?? base[item.id];
            if (v) posted.set(`answer:${id}:${item.id}`, v);
          }
          break;
        }
        case "acknowledgement":
          posted.set(`answer:${id}`, "yes");
          break;
        case "short_text":
        case "long_text":
          if (typeof o === "string") posted.set(`answer:${id}`, o);
          else if (id === "deck_condition" && kind !== "outbound") {
            const rate = isRenter ? scenario.text.deck_notes_rate.renter_return : scenario.text.deck_notes_rate.staff_return;
            if (rand.chance(rate)) posted.set(`answer:${id}`, rand.pick(isRenter ? scenario.text.deck_notes_renter : scenario.text.deck_notes_staff));
          }
          break;
        default:
          break;
      }
    }
  }
  return posted;
}

type PhotoPick = { slot: string; media: string };

function photoPicks(kind: InspectionKind, s: Session, slots: InspectionField[], rand: Rand, explicit: { photos?: string[]; damage?: string[] } | null): PhotoPick[] {
  const rateKey = kind === "outbound" ? "outbound" : kind === "staff-return" ? "staff_return" : "renter_return";
  const out: PhotoPick[] = [];
  for (const slot of slots) {
    if (slot.id === DAMAGE_PHOTOS_SLOT_ID) {
      for (const media of explicit?.damage ?? []) out.push({ slot: slot.id, media });
      continue;
    }
    const media = s.asset.photos[slot.id];
    if (!media) continue;
    const wanted = explicit?.photos ? explicit.photos.includes(slot.id) : rand.chance(s.asset.photo_rates[rateKey][slot.id] ?? 0);
    if (wanted) out.push({ slot: slot.id, media });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// The builder
// ---------------------------------------------------------------------------------------------------------------------

export type BuildInput = {
  scenario: Scenario;
  scenarioSha256: string;
  media: MediaMap;
  previous: (Pick<Dataset, "pinned_ids" | "templates"> & { retired_ids?: PinnedId[] }) | null;
  anchorDate?: string;
  randomId?: () => string;
};

export function buildShowcaseDataset(input: BuildInput): Dataset {
  const { scenario, media } = input;
  const anchorDate = input.anchorDate ?? scenario.anchor.date;
  const clock = new Clock(anchorDate, scenario.anchor.local_hour);
  const org = scenario.organization_id;
  const ids = new IdKeeper(input.previous?.pinned_ids ?? [], input.randomId ?? randomUUID);
  const mediaByKey = new Map(media.items.map((m) => [m.key, m]));
  const staffByKey = new Map(scenario.staff.map((s) => [s.key, s]));
  const staff = (key: string) => {
    const s = staffByKey.get(key);
    if (!s) throw new Error(`unknown staff ${key}`);
    return s;
  };
  const p = plan(scenario, clock);
  schedule(scenario, clock, p);

  const templates: Record<string, Json> = {};
  const rows: Dataset["rows"] = { asset_rental_sessions: [], asset_acknowledgements: [], form_submissions: [], scan_events: [] };
  const objects: Dataset["objects"] = [];
  type Pending = { key: string; table: keyof Dataset["rows"]; at: Date; build: (id: string) => Row };
  const pending: Pending[] = [];
  const sessionId = new Map<string, string>();

  // Rental sessions first: every submission and acknowledgement refers to one.
  const contracts = [...p.sessions].sort((a, b) => (a.startedAt as Date).getTime() - (b.startedAt as Date).getTime());
  const referenceOf = new Map(contracts.map((s, i) => [s.key, `${scenario.labels.rental_reference_prefix}${scenario.labels.first_contract_number + i}`]));
  for (const s of contracts) {
    const startedAt = s.startedAt as Date;
    const id = ids.get(s.key, "asset_rental_sessions", startedAt);
    sessionId.set(s.key, id);
    const label = s.renter.company ?? `${s.renter.name.split(" ").slice(-1)[0]}, ${s.renter.name[0]}.`;
    rows.asset_rental_sessions.push({
      id,
      organization_id: org,
      asset_id: s.asset.asset_id,
      status: s.returnedAt ? "returned" : "active",
      rental_reference: referenceOf.get(s.key) ?? null,
      renter_label: label,
      started_at: pgTime(startedAt),
      returned_at: s.returnedAt ? pgTime(s.returnedAt) : null,
      created_by_profile_id: null,
      returned_by_profile_id: null,
      created_at: pgTime(startedAt),
      updated_at: pgTime(s.returnedAt ?? startedAt),
    });
  }

  const inspectionRow = (
    key: string,
    kind: InspectionKind,
    s: Session,
    at: Date,
    who: { name: string | null; email: string | null; phone: string | null },
    overrides: Answers,
    explicit: { photos?: string[]; damage?: string[] } | null,
    statusFor: (flagged: boolean) => string,
    rand: Rand
  ) => {
    const template = templateFor(kind, s.asset);
    const ref = templateRef(kind, template);
    const snapshot = JSON.parse(JSON.stringify(template)) as Json;
    const frozen = input.previous?.templates?.[ref];
    if (frozen !== undefined && JSON.stringify(frozen) !== JSON.stringify(snapshot)) {
      throw new Error(`template ${ref} changed without a version bump: bump its version in lib/inspections before rebuilding`);
    }
    templates[ref] = snapshot;
    const posted = formAnswers(kind, template, s, overrides, rand, scenario);
    const values = parseAnswerValues(template, (k) => posted.get(k) ?? null);
    const error = evaluateInspection(template, values);
    if (error) throw new Error(`${key}: the app rejects these answers (${error})`);
    const slots = visiblePhotoSlots(template, values);
    const picks = photoPicks(kind, s, slots, rand, explicit);
    pending.push({
      key,
      table: "form_submissions",
      at,
      build: (id) => {
        const photos: Record<string, PhotoAnswer[]> = {};
        const mediaPaths: string[] = [];
        picks.forEach((pick, i) => {
          const item = mediaByKey.get(pick.media);
          if (!item) throw new Error(`${key}: unknown media ${pick.media}`);
          if (item.asset_code !== s.asset.asset_code) throw new Error(`${key}: media ${pick.media} shows another asset`);
          // The image's hash is part of the key: a replaced image gets a new object (staging never overwrites one).
          const objectId = ids.get(`object:${key}:${pick.slot}:${i}:${item.sha256.slice(0, 12)}`, "objects", at);
          const objectPath = `${submissionPathPrefix(org, s.asset.asset_id, id)}/${mediaObjectName(objectId, item.content_type)}`;
          const slot = slots.find((x) => x.id === pick.slot) as InspectionField;
          (photos[pick.slot] ??= []).push({ path: objectPath, caption: slot.label });
          mediaPaths.push(objectPath);
          objects.push({ bucket: "submissions", path: objectPath, media: item.key, content_type: item.content_type, bytes: item.bytes, sha256: item.sha256 });
        });
        const flags = deriveFlags(template, values);
        const total = Object.values(photos).reduce((n, list) => n + list.length, 0);
        const evidence = resolvePhotoEvidence({
          damage: flags.damage_observed === "yes",
          damagePhotoCount: photos[DAMAGE_PHOTOS_SLOT_ID]?.length ?? 0,
          totalPhotoCount: total,
          hasPhotoSlots: slots.length > 0,
          acknowledged: true,
        });
        if (evidence.error) throw new Error(`${key}: ${evidence.error}`);
        flags.damage_photos_missing = evidence.damagePhotosMissing;
        flags.condition_photos_missing = evidence.conditionPhotosMissing;
        const missingSlots = slots.filter((slot) => (photos[slot.id]?.length ?? 0) === 0).map((slot) => slot.id);
        const data: Record<string, unknown> = {
          ...buildReturnSubmissionData({ template, answers: buildAnswers(values, photos), flags }),
          ...(kind === "staff-return" ? { audience: "staff" } : {}),
          ...(missingSlots.length > 0 ? { missing_recommended_photo_slots: missingSlots } : {}),
          ...(evidence.damagePhotosMissing || evidence.conditionPhotosMissing ? { photo_omission_acknowledged: true } : {}),
        };
        data.template_snapshot = { $template: ref };
        const flagged = flags.damage_observed === "yes" || flags.accessories_missing;
        return {
          id,
          organization_id: org,
          asset_id: s.asset.asset_id,
          form_type: kind === "outbound" ? "pre_use_inspection" : "return_checklist",
          submitted_by_name: who.name,
          submitted_by_email: who.email,
          submitted_by_phone: who.phone,
          submission_data_json: data as Json,
          media_urls: mediaPaths,
          status: statusFor(flagged),
          created_at: pgTime(at),
          rental_session_id: sessionId.get(s.key) as string,
          inspection_template_key: template.key,
          inspection_template_version: template.version,
          submission_origin: kind === "return" ? "public" : "staff",
          submitted_by_profile_id: null,
        };
      },
    });
  };

  const reportRow = (incident: IncidentSpec, s: Session, at: Date, rand: Rand) => {
    const r = s.renter;
    const email = r.email && (!r.phone || rand.chance(0.7)) ? r.email : null;
    const phone = r.phone && (!email || rand.chance(0.6)) ? r.phone : null;
    const form = new FormData();
    form.set(TRIAGE_VERSION_FIELD, String(TRIAGE_VERSION));
    const t = incident.triage ?? {};
    if (incident.form === "damage_report") {
      form.set(TRIAGE_FIELDS.equipmentState, t.equipment_state ?? "");
      form.set(TRIAGE_FIELDS.responseNeed, t.response_need ?? "");
      form.set(TRIAGE_FIELDS.damageSeverity, t.damage_severity ?? "");
    } else {
      form.set(TRIAGE_FIELDS.issueType, t.issue_type ?? "");
      form.set(TRIAGE_FIELDS.responseNeed, t.response_need ?? "");
    }
    const description = incident.description ?? null;
    const capture =
      incident.form === "damage_report"
        ? captureDamageReport(form, description)
        : captureSupportRequest(form, { preferredContactMethod: t.preferred_contact_method ?? null, description });
    const fieldError =
      incident.form === "damage_report"
        ? validateDamageReport({ name: r.name, email, phone, urgency: capture.legacyUrgency, description })
        : validateSupportRequest({ name: r.name, email, phone, preferred_contact_method: t.preferred_contact_method ?? null, description });
    if (fieldError) throw new Error(`incident ${incident.key}: the app rejects it (${fieldError})`);
    for (const [k, v] of Object.entries(t)) {
      const stored = (capture.dataJson as Record<string, unknown>)[`reported_${k}`] ?? (capture.dataJson as Record<string, unknown>)[k];
      if (k !== "preferred_contact_method" && stored !== v) throw new Error(`incident ${incident.key}: ${k}=${v} is not a valid triage answer`);
    }
    const key = `${incident.form}:${incident.key}`;
    pending.push({
      key,
      table: "form_submissions",
      at,
      build: (id) => {
        const mediaPaths = (incident.photos ?? []).map((m, i) => {
          const item = mediaByKey.get(m);
          if (!item) throw new Error(`incident ${incident.key}: unknown media ${m}`);
          if (item.asset_code !== s.asset.asset_code) throw new Error(`incident ${incident.key}: media ${m} shows another asset`);
          const objectId = ids.get(`object:${key}:photo:${i}:${item.sha256.slice(0, 12)}`, "objects", at);
          const objectPath = `${submissionPathPrefix(org, s.asset.asset_id, id)}/${mediaObjectName(objectId, item.content_type)}`;
          objects.push({ bucket: "submissions", path: objectPath, media: item.key, content_type: item.content_type, bytes: item.bytes, sha256: item.sha256 });
          return objectPath;
        });
        return {
          id,
          organization_id: org,
          asset_id: s.asset.asset_id,
          form_type: incident.form,
          submitted_by_name: r.name,
          submitted_by_email: email,
          submitted_by_phone: phone,
          submission_data_json: capture.dataJson as Json,
          media_urls: mediaPaths,
          status: incident.status,
          created_at: pgTime(at),
          rental_session_id: null,
          inspection_template_key: null,
          inspection_template_version: null,
          submission_origin: "public",
          submitted_by_profile_id: null,
        };
      },
    });
  };

  // Submissions and acknowledgements per session, then scans.
  type ScanPlan = { asset: AssetSpec; at: Date; device: string; network: string };
  const scans: ScanPlan[] = [];
  const renterIndex = new Map(scenario.renters.map((r, i) => [r.key, i]));
  const crewDevices = Object.keys(scenario.visitor_devices);
  for (const s of p.sessions) {
    const rand = new Rand(scenario.seed, `records:${s.key}`);
    const srand = new Rand(scenario.seed, `scans:${s.key}`);
    const staffScan = (at: Date, staffKey: string) => {
      const st = staff(staffKey);
      const device = scenario.devices[st.device];
      scans.push({ asset: s.asset, at: new Date(at.getTime() - srand.int(...scenario.scans.staff_scan_before_action_minutes) * MIN - srand.int(0, 59) * 1000), device: st.device, network: device.network ?? "192.0.2.1" });
    };
    const crew = (j: number) => ({
      device: j === 0 ? s.renter.device : crewDevices[((renterIndex.get(s.renter.key) ?? 0) + j) % crewDevices.length],
      network: `198.51.100.${10 + (renterIndex.get(s.renter.key) ?? 0) * 4 + j}`,
    });
    const renterScan = (at: Date, j = 0) => {
      scans.push({ asset: s.asset, at: new Date(at.getTime() - srand.int(...scenario.scans.renter_scan_before_action_minutes) * MIN - srand.int(0, 59) * 1000), ...crew(j) });
    };
    const sid = s.key;
    if (s.outbound && s.outboundAt) {
      const st = staff(s.outboundStaff as string);
      staffScan(s.outboundAt, st.key);
      const explicit = s.final?.outbound ? { photos: s.final.outbound.photos } : null;
      inspectionRow(`outbound:${sid}`, "outbound", s, s.outboundAt, { name: st.name, email: null, phone: null }, {}, explicit, () => "resolved", rand);
    }
    if (s.ack && s.ackAt) {
      renterScan(s.ackAt, 0);
      const ackAt = s.ackAt;
      const name = `${s.renter.name}${scenario.labels.acknowledgement_name_suffix}`;
      const ackError = validateAcknowledgement({ name, acknowledged: true });
      if (ackError) throw new Error(`${sid}: ${ackError}`);
      const email = s.renter.email && rand.chance(0.6) ? s.renter.email : null;
      const phone = s.renter.phone && rand.chance(0.5) ? s.renter.phone : null;
      pending.push({
        key: `ack:${sid}`,
        table: "asset_acknowledgements",
        at: ackAt,
        build: (id) => ({
          id,
          organization_id: org,
          asset_id: s.asset.asset_id,
          name,
          email,
          phone,
          statement: ACKNOWLEDGEMENT_STATEMENT,
          acknowledged_at: pgTime(ackAt),
          created_at: pgTime(ackAt),
          rental_session_id: sessionId.get(s.key) as string,
        }),
      });
    }
    // Damage and support reports during (or, when late, the morning after) the rental.
    for (const incident of s.incidents) {
      let at: Date;
      if (incident.at) at = clock.dt(incident.at, rand.int(0, 59));
      else if (incident.late && s.returnedAt && s.backDay !== null) at = clock.at(s.backDay + 1, rand.int(toMinutes("09:00"), toMinutes("10:45")), rand.int(0, 59));
      else {
        const start = (s.startedAt as Date).getTime() + 60 * MIN;
        const end = (s.renterReturnAt ?? s.staffReturnAt ?? s.returnedAt ?? clock.anchor).getTime() - 60 * MIN;
        const day = s.backDay === null || s.backDay === s.outDay ? s.outDay : rand.int(s.outDay, Math.max(s.outDay, s.backDay - (s.backDay > s.outDay ? 1 : 0)));
        const candidate = clock.at(day, rand.int(toMinutes("09:00"), toMinutes("16:30")), rand.int(0, 59)).getTime();
        at = new Date(clamp(candidate, start, end));
      }
      renterScan(at, 0);
      reportRow(incident, s, at, rand);
    }
    if (s.renterReturn && s.renterReturnAt) {
      renterScan(s.renterReturnAt, 0);
      const r = s.renter;
      const explicit = s.final?.renter_return ? { photos: s.final.renter_return.photos } : null;
      inspectionRow(
        `renter_return:${sid}`,
        "return",
        s,
        s.renterReturnAt,
        { name: rand.chance(0.9) ? r.name : null, email: r.email && rand.chance(0.7) ? r.email : null, phone: r.phone && rand.chance(0.6) ? r.phone : null },
        {},
        explicit,
        () => "resolved",
        rand
      );
    }
    if (s.closing === "staff" && s.staffReturnAt && s.closeStaff) {
      const st = staff(s.closeStaff);
      staffScan(s.staffReturnAt, st.key);
      const flag = s.flag;
      const close = s.final?.close;
      const overrides = { ...(flag?.answers ?? {}), ...(close?.answers ?? {}) };
      const explicit = close
        ? { photos: close.photos, damage: close.damage_photos }
        : flag
          ? { photos: flag.staff_photos, damage: flag.damage_photos }
          : null;
      const finalStatus = close?.status ?? flag?.status;
      inspectionRow(
        `staff_return:${sid}`,
        "staff-return",
        s,
        s.staffReturnAt,
        { name: st.name, email: st.email, phone: null },
        overrides,
        explicit,
        (flagged) => {
          const live = staffReturnStatus({ damage: flagged, missing: flagged, flagged });
          if (flagged && !finalStatus) throw new Error(`${sid}: a flagged staff return needs a status in the scenario`);
          if (!flagged && finalStatus) throw new Error(`${sid}: the scenario gives a status to a clean staff return`);
          return flagged ? (finalStatus as string) : live;
        },
        rand
      );
    }
    // Crew scans on the first day and on later rental days (the renter reading the page, instructions, the guide).
    const kind = s.asset.kind;
    const firstDay = Number(srand.weighted(scenario.scans.first_day_scans[kind])) - (s.ack ? 1 : 0);
    const endTime = (s.renterReturnAt ?? s.staffReturnAt ?? s.returnedAt ?? clock.anchor).getTime() - 15 * MIN;
    const firstDayEnd = Math.min(endTime, clock.at(s.outDay, toMinutes("20:30")).getTime());
    for (let i = 0; i < firstDay; i++) {
      const t = (s.startedAt as Date).getTime() + srand.int(8, 240) * MIN + srand.int(0, 59) * 1000;
      if (t < firstDayEnd) scans.push({ asset: s.asset, at: new Date(t), ...crew(Math.min(i + (s.ack ? 1 : 0), Math.max(0, s.renter.crew - 1))) });
    }
    const lastDay = s.backDay ?? -1;
    for (let d = s.outDay + 1; d <= lastDay; d++) {
      const count = Number(srand.weighted(scenario.scans.later_day_scans[kind]));
      for (let i = 0; i < count; i++) {
        const t = clock.at(d, srand.int(toMinutes("07:00"), toMinutes("16:00")), srand.int(0, 59)).getTime();
        if (t < endTime && t < clock.anchor.getTime()) scans.push({ asset: s.asset, at: new Date(t), ...crew(srand.int(0, Math.max(0, s.renter.crew - 1))) });
      }
    }
  }

  // Occasional browsing: people reading a tag on the lot or the page before renting, up to the target total.
  const idleRand = new Rand(scenario.seed, "scans:idle");
  const idleCount = scenario.scans.target_total - scans.length;
  if (idleCount < 0) throw new Error(`rental scans alone (${scans.length}) exceed the scan target ${scenario.scans.target_total}`);
  const assetsByCode = new Map(scenario.assets.map((a) => [a.asset_code, a]));
  const dayWeights: Weights = {};
  for (let d = -scenario.history_days; d <= -1; d++) dayWeights[String(d)] = scenario.scans.idle_weekday_weight[clock.weekday(d)] ?? 0;
  const [idleFrom, idleTo] = scenario.scans.idle_hours.map(toMinutes);
  for (let i = 0; i < idleCount; i++) {
    const asset = assetsByCode.get(idleRand.pick(scenario.assets.map((a) => a.asset_code))) as AssetSpec;
    const day = Number(idleRand.weighted(dayWeights));
    scans.push({
      asset,
      at: clock.at(day, idleRand.int(idleFrom, idleTo), idleRand.int(0, 59)),
      device: idleRand.weighted(scenario.visitor_devices),
      network: `203.0.113.${idleRand.int(1, 254)}`,
    });
  }

  // Ids in time order (stable per key), then the rows.
  pending.sort((a, b) => a.at.getTime() - b.at.getTime() || a.key.localeCompare(b.key));
  for (const item of pending) rows[item.table].push(item.build(ids.get(item.key, item.table, item.at)));
  for (const code of scenario.assets.map((a) => a.asset_code)) {
    const asset = assetsByCode.get(code) as AssetSpec;
    const own = scans.filter((x) => x.asset.asset_code === code).sort((a, b) => a.at.getTime() - b.at.getTime() || a.device.localeCompare(b.device));
    own.forEach((scan, i) => {
      const userAgent = scenario.devices[scan.device]?.user_agent;
      if (!userAgent) throw new Error(`unknown device ${scan.device}`);
      rows.scan_events.push({
        id: ids.get(`scan:${code}:${i + 1}`, "scan_events", scan.at),
        organization_id: org,
        asset_id: asset.asset_id,
        qr_link_id: asset.qr_link_id,
        scanned_at: pgTime(scan.at),
        user_agent: userAgent,
        ip_hash: hashIp(scan.network, SCAN_HASH_SALT),
        referrer: null,
        device_type: deviceTypeFromUserAgent(userAgent),
      });
    });
  }
  for (const list of Object.values(rows)) list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  objects.sort((a, b) => a.path.localeCompare(b.path));

  const dataset: Dataset = {
    schema: DATASET_SCHEMA,
    scenario: { id: scenario.scenario_id, version: scenario.version, seed: scenario.seed, sha256: input.scenarioSha256 },
    anchor: { date: anchorDate, time_zone: scenario.time_zone, local: `${anchorDate} ${String(scenario.anchor.local_hour).padStart(2, "0")}:00`, utc: pgTime(clock.anchor) },
    history_start_utc: pgTime(clock.at(-scenario.history_days, 0)),
    organization_id: org,
    assets: scenario.assets.map((a) => {
      const active = p.sessions.find((s) => s.asset.asset_code === a.asset_code && !s.returnedAt);
      return { asset_code: a.asset_code, asset_id: a.asset_id, qr_link_id: a.qr_link_id, short_code: a.short_code, active_rental_session_id: active ? (sessionId.get(active.key) as string) : null };
    }),
    templates: Object.fromEntries(Object.entries(templates).sort(([a], [b]) => a.localeCompare(b))),
    rows,
    objects,
    stories: stories(scenario, p, rows, sessionId, ids.pinned),
    summary: {},
    pinned_ids: [...ids.pinned].sort((a, b) => a.key.localeCompare(b.key)),
    retired_ids: retired(input.previous, ids.pinned),
  };
  dataset.summary = summarize(dataset, scenario);
  checkDataset(dataset, scenario, clock);
  return dataset;
}

/** Ids the previous version owned (or had already retired) that this build no longer uses, objects excluded. */
function retired(previous: BuildInput["previous"], pinned: PinnedId[]): PinnedId[] {
  const now = new Set(pinned.map((p) => p.id));
  const tableOf = (p: { key: string; table?: string }) =>
    p.table ??
    (p.key.startsWith("session:") ? "asset_rental_sessions" : p.key.startsWith("ack:") ? "asset_acknowledgements" : p.key.startsWith("scan:") ? "scan_events" : p.key.startsWith("object:") ? "objects" : "form_submissions");
  const out = new Map<string, PinnedId>();
  for (const p of [...(previous?.retired_ids ?? []), ...(previous?.pinned_ids ?? [])]) {
    const table = tableOf(p);
    if (table !== "objects" && !now.has(p.id)) out.set(p.id, { key: p.key, id: p.id, table });
  }
  return [...out.values()].sort((a, b) => a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------------------------------------------------
// Stories, summary and invariants
// ---------------------------------------------------------------------------------------------------------------------

function stories(scenario: Scenario, p: Plan, rows: Dataset["rows"], sessionId: Map<string, string>, pinned: { key: string; id: string }[]): Record<string, Json> {
  const byKey = new Map(pinned.map((x) => [x.key, x.id]));
  const subs = new Map(rows.form_submissions.map((r) => [String(r.id), r]));
  const sessions = new Map(rows.asset_rental_sessions.map((r) => [String(r.id), r]));
  const subRef = (key: string) => {
    const id = byKey.get(key);
    const row = id ? subs.get(id) : undefined;
    return row ? { key, reference: submissionReference(String(row.id), String(row.created_at)), form_type: row.form_type, status: row.status, created_at: row.created_at } : null;
  };
  const out: Record<string, Json> = {};
  for (const asset of scenario.assets) {
    const finals = p.sessions.filter((s) => s.asset.asset_code === asset.asset_code && s.final);
    out[asset.asset_code] = {
      sessions: finals.map((s) => {
        const id = sessionId.get(s.key) as string;
        const row = sessions.get(id) as Row;
        const reference = rentalSessionRef(id, String(row.started_at));
        return {
          key: s.final?.key ?? s.key,
          reference,
          rental_reference: row.rental_reference,
          status: row.status,
          renter: s.renter.company ?? s.renter.name,
          started_at: row.started_at,
          returned_at: row.returned_at,
          records: [`outbound:${s.key}`, `renter_return:${s.key}`, `staff_return:${s.key}`].map(subRef).filter(Boolean) as Json[],
          story: s.final?.story ?? null,
        } as Json;
      }),
      incidents: scenario.incidents
        .filter((i) => i.asset === asset.asset_code)
        .map((i) => {
          const s = p.sessions.find((x) => x.incidents.includes(i) || x.flag === i);
          return {
            key: i.key,
            form: i.form,
            status: i.status,
            record: i.form === "staff_return_flag" && s ? subRef(`staff_return:${s.key}`) : subRef(`${i.form}:${i.key}`),
            story: i.story ?? null,
          } as Json;
        }),
    };
  }
  return out;
}

function summarize(d: Dataset, scenario: Scenario): Record<string, Json> {
  const subs = d.rows.form_submissions;
  const count = (f: (r: Row) => boolean) => subs.filter(f).length;
  const sessions = d.rows.asset_rental_sessions;
  const completed = sessions.filter((s) => s.status === "returned").length;
  const perAsset: Record<string, Json> = {};
  for (const a of d.assets) {
    const own = (r: Row) => r.asset_id === a.asset_id;
    perAsset[a.asset_code] = {
      sessions: sessions.filter(own).length,
      completed: sessions.filter((s) => own(s) && s.status === "returned").length,
      active: sessions.filter((s) => own(s) && s.status === "active").length,
      scans: d.rows.scan_events.filter(own).length,
      open: subs.filter((s) => own(s) && (s.status === "new" || s.status === "reviewed")).map((s) => `${s.form_type}:${s.status}`),
    };
  }
  return {
    sessions: { total: sessions.length, completed, active: sessions.length - completed },
    outbound: count((r) => r.form_type === "pre_use_inspection"),
    acknowledgements: d.rows.asset_acknowledgements.length,
    staff_returns: count((r) => r.form_type === "return_checklist" && r.submission_origin === "staff"),
    renter_returns: count((r) => r.form_type === "return_checklist" && r.submission_origin === "public"),
    damage_reports: count((r) => r.form_type === "damage_report"),
    support_requests: count((r) => r.form_type === "support_request"),
    status: Object.fromEntries(["new", "reviewed", "resolved", "archived"].map((s) => [s, count((r) => r.status === s)])),
    with_photos: count((r) => Array.isArray(r.media_urls) && r.media_urls.length > 0),
    without_photos_acknowledged: count((r) => Boolean((r.submission_data_json as { photo_omission_acknowledged?: boolean } | null)?.photo_omission_acknowledged)),
    objects: d.objects.length,
    object_bytes: d.objects.reduce((n, o) => n + o.bytes, 0),
    scans: d.rows.scan_events.length,
    scan_devices: Object.fromEntries(["mobile", "tablet", "desktop"].map((t) => [t, d.rows.scan_events.filter((s) => s.device_type === t).length])),
    targets: scenario.rates_target as unknown as Json,
    per_asset: perAsset,
  };
}

const within = (actual: number, target: number) => Math.abs(actual - target) <= 1;

/** The invariants every dataset must hold; the builder refuses to emit one that breaks any. */
export function checkDataset(d: Dataset, scenario: Scenario, clock: Clock) {
  const problems: string[] = [];
  const anchor = clock.anchor.getTime();
  const notBefore = new Map(scenario.assets.map((a) => [a.asset_id, Date.parse(a.not_before)]));
  const [earliest, latest] = [toMinutes(scenario.event_hours.earliest), toMinutes(scenario.event_hours.latest)];
  const stamp = (table: string, row: Row, col: string) => {
    const v = row[col];
    if (v === null) return;
    const t = Date.parse(String(v));
    if (!(t <= anchor)) problems.push(`${table} ${row.id} ${col} is after the anchor`);
    if (!(t >= (notBefore.get(String(row.asset_id)) ?? 0))) problems.push(`${table} ${row.id} ${col} is before its asset or QR existed`);
    const local = localParts(new Date(t)).minutes;
    if (local < earliest || local > latest) problems.push(`${table} ${row.id} ${col} falls outside ${scenario.event_hours.earliest}-${scenario.event_hours.latest} local`);
  };
  for (const s of d.rows.asset_rental_sessions) for (const c of ["started_at", "returned_at", "created_at", "updated_at"]) stamp("session", s, c);
  for (const s of d.rows.form_submissions) stamp("submission", s, "created_at");
  for (const s of d.rows.asset_acknowledgements) for (const c of ["acknowledged_at", "created_at"]) stamp("acknowledgement", s, c);
  for (const s of d.rows.scan_events) stamp("scan", s, "scanned_at");

  // One rental at a time per asset, at most one active; children inside their session.
  const sessions = new Map(d.rows.asset_rental_sessions.map((s) => [String(s.id), s]));
  const byAsset = new Map<string, Row[]>();
  for (const s of sessions.values()) byAsset.set(String(s.asset_id), [...(byAsset.get(String(s.asset_id)) ?? []), s]);
  for (const [asset, list] of byAsset) {
    list.sort((a, b) => Date.parse(String(a.started_at)) - Date.parse(String(b.started_at)));
    if (list.filter((s) => s.status === "active").length > 1) problems.push(`asset ${asset} has more than one active session`);
    for (let i = 1; i < list.length; i++) {
      const prevEnd = list[i - 1].returned_at;
      if (prevEnd === null) problems.push(`asset ${asset}: a session starts while another is active`);
      else if (Date.parse(String(list[i].started_at)) - Date.parse(String(prevEnd)) < 2 * 60 * MIN) problems.push(`asset ${asset}: less than 2 hours between rentals before ${list[i].id}`);
    }
  }
  for (const a of d.assets) {
    const active = [...sessions.values()].find((s) => s.asset_id === a.asset_id && s.status === "active");
    if ((active?.id ?? null) !== a.active_rental_session_id) problems.push(`asset ${a.asset_code} pointer disagrees with its active session`);
  }
  const inside = (row: Row, col: string, sessionIdValue: Json) => {
    const s = sessions.get(String(sessionIdValue));
    if (!s) return problems.push(`${row.id} refers to an unknown session`);
    const t = Date.parse(String(row[col]));
    const start = Date.parse(String(s.started_at));
    const end = s.returned_at === null ? anchor : Date.parse(String(s.returned_at));
    const isOutbound = row.form_type === "pre_use_inspection";
    if (isOutbound ? !(t <= start && start - t <= 30 * 1000) : !(t > start && t <= end)) problems.push(`${row.id} ${col} is outside its session`);
  };
  for (const s of d.rows.form_submissions) if (s.rental_session_id) inside(s, "created_at", s.rental_session_id);
  for (const s of d.rows.asset_acknowledgements) inside(s, "acknowledged_at", s.rental_session_id);
  const perSession = new Map<string, number>();
  for (const s of d.rows.form_submissions) {
    if (!s.rental_session_id) continue;
    const kind = s.form_type === "pre_use_inspection" ? "outbound" : s.submission_origin === "staff" ? "staff" : null;
    if (!kind) continue;
    const k = `${s.rental_session_id}:${kind}`;
    perSession.set(k, (perSession.get(k) ?? 0) + 1);
  }
  for (const [k, n] of perSession) if (n > 1) problems.push(`session ${k} has ${n} rows (the app allows one)`);
  for (const s of d.rows.form_submissions) {
    if (s.form_type === "return_checklist" && s.submission_origin === "staff") {
      const session = sessions.get(String(s.rental_session_id)) as Row;
      const gap = Date.parse(String(session.returned_at)) - Date.parse(String(s.created_at));
      if (!(gap >= 0 && gap <= 30 * 1000)) problems.push(`staff return ${s.id} is not seconds before its session closed`);
    }
    if ((s.form_type === "damage_report" || s.form_type === "support_request") && (s.rental_session_id !== null || s.inspection_template_key !== null)) problems.push(`${s.id}: reports carry no session or template`);
    if (s.submission_origin === "staff" && !String(s.submitted_by_email ?? "").endsWith(".example") && s.form_type === "return_checklist") problems.push(`${s.id}: staff email must be a reserved example address`);
  }
  for (const ack of d.rows.asset_acknowledgements) {
    if (!String(ack.name).endsWith(scenario.labels.acknowledgement_name_suffix)) problems.push(`acknowledgement ${ack.id} is not labelled a demo record`);
  }
  for (const row of [...d.rows.form_submissions, ...d.rows.asset_acknowledgements]) {
    const email = (row.submitted_by_email ?? row.email) as string | null;
    const phone = (row.submitted_by_phone ?? row.phone) as string | null;
    if (email && !/\.example$/.test(email)) problems.push(`${row.id}: ${email} is not a reserved example address`);
    if (phone && !/^\d{3}-555-01\d{2}$/.test(phone)) problems.push(`${row.id}: ${phone} is not a reserved fictional number`);
  }
  const refs = new Set<string>();
  for (const [table, list] of [["session", d.rows.asset_rental_sessions], ["submission", d.rows.form_submissions]] as const) {
    for (const r of list) {
      const year = String(table === "session" ? r.started_at : r.created_at).slice(0, 4);
      const key = `${table}:${year}:${String(r.id).slice(0, 6)}`;
      if (refs.has(key)) problems.push(`display reference collision ${key}`);
      refs.add(key);
    }
  }

  // Volumes and rates against the approved targets.
  const sm = d.summary as unknown as {
    sessions: { total: number; completed: number };
    status: Record<string, number>;
    outbound: number;
    acknowledgements: number;
    staff_returns: number;
    renter_returns: number;
    damage_reports: number;
    support_requests: number;
    scans: number;
  };
  const t = scenario.rates_target;
  const total = sm.sessions.total;
  const completed = sm.sessions.completed;
  if (!within(sm.outbound, Math.round(t.outbound * total))) problems.push(`outbound ${sm.outbound} vs target ${Math.round(t.outbound * total)}`);
  if (!within(sm.acknowledgements, Math.round(t.acknowledgement * total))) problems.push(`acknowledgements ${sm.acknowledgements} vs ${Math.round(t.acknowledgement * total)}`);
  if (!within(sm.staff_returns, Math.round(t.staff_return * completed))) problems.push(`staff returns ${sm.staff_returns} vs ${Math.round(t.staff_return * completed)}`);
  if (!within(sm.renter_returns, Math.round(t.renter_return * completed))) problems.push(`renter returns ${sm.renter_returns} vs ${Math.round(t.renter_return * completed)}`);
  if (sm.damage_reports !== t.damage_reports) problems.push(`damage reports ${sm.damage_reports} vs ${t.damage_reports}`);
  if (sm.support_requests !== t.support_requests) problems.push(`support requests ${sm.support_requests} vs ${t.support_requests}`);
  if (sm.status.new !== t.open_at_anchor.new || sm.status.reviewed !== t.open_at_anchor.reviewed) problems.push(`open at the anchor: ${sm.status.new} new / ${sm.status.reviewed} reviewed`);
  if (Math.abs(sm.scans - t.scans_total) > scenario.scans.tolerance) problems.push(`scans ${sm.scans} vs ${t.scans_total}`);
  for (const a of scenario.assets) {
    const pa = (d.summary.per_asset as Record<string, { completed: number }>)[a.asset_code];
    if (pa.completed !== a.completed_rentals) problems.push(`${a.asset_code}: ${pa.completed} completed rentals, scenario says ${a.completed_rentals}`);
  }
  if (problems.length) throw new Error(`the dataset breaks ${problems.length} invariant(s):\n- ${problems.slice(0, 40).join("\n- ")}`);
}
