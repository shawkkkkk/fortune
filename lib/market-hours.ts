// US equity session status for tokenized stocks. Client-safe and dependency-free.
//
// Tokenized stocks trade onchain around the clock, but the listed share, the
// issuer's creation/redemption and most stock price feeds follow NYSE/Nasdaq
// hours. Outside them an onchain price can drift and gap at the next open, so
// Fortune shows the session next to every stock pair.

export type UsSession = "pre" | "regular" | "after" | "closed";

export type UsMarketStatus = {
  session: UsSession;
  /** Why the market is closed, when it is. */
  closedReason: "weekend" | "holiday" | "overnight" | null;
  holiday: string | null;
  earlyClose: boolean;
  /** Epoch milliseconds of the next session change, when the calendar covers it. */
  nextChange: number | null;
  nextSession: UsSession | null;
  /** False once the date is past the embedded exchange calendar. */
  calendarKnown: boolean;
};

const ZONE = "America/New_York";
const CALENDAR_LAST_YEAR = 2027;

// NYSE full-day closures (observed dates).
const HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Washington's Birthday",
  "2026-04-03": "Good Friday",
  "2026-05-25": "Memorial Day",
  "2026-06-19": "Juneteenth",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Washington's Birthday",
  "2027-03-26": "Good Friday",
  "2027-05-31": "Memorial Day",
  "2027-06-18": "Juneteenth (observed)",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-12-24": "Christmas Day (observed)",
};

// 1:00 p.m. ET closes; extended hours then end at 5:00 p.m.
const EARLY_CLOSES = new Set(["2026-11-27", "2026-12-24", "2027-11-26"]);

const PRE_OPEN = 4 * 60;
const OPEN = 9 * 60 + 30;
const CLOSE = 16 * 60;
const EARLY_CLOSE = 13 * 60;
const AFTER_CLOSE = 20 * 60;
const EARLY_AFTER_CLOSE = 17 * 60;

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  weekday: "short",
  hourCycle: "h23",
});

function local(ms: number) {
  const map = Object.fromEntries(parts.formatToParts(new Date(ms)).map((part) => [part.type, part.value]));
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    year: Number(map.year),
    weekday: map.weekday as string,
    minutes: Number(map.hour) * 60 + Number(map.minute),
    seconds: Number(map.second),
  };
}

/** Offset of New York from UTC at an instant, in minutes (e.g. -240 in summer). */
function offsetMinutes(ms: number) {
  const { date, minutes, seconds } = local(ms);
  const [y, m, d] = date.split("-").map(Number);
  const asUtc = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, seconds);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** Epoch milliseconds for a New York wall-clock time on a calendar date. */
function zonedTime(date: string, minuteOfDay: number) {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  let guess = naive - offsetMinutes(naive) * 60_000;
  guess = naive - offsetMinutes(guess) * 60_000;
  return guess;
}

function addDays(date: string, days: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function tradingDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !HOLIDAYS[date];
}

function sessionBounds(date: string) {
  const early = EARLY_CLOSES.has(date);
  return [
    { session: "pre" as const, from: PRE_OPEN, to: OPEN },
    { session: "regular" as const, from: OPEN, to: early ? EARLY_CLOSE : CLOSE },
    { session: "after" as const, from: early ? EARLY_CLOSE : CLOSE, to: early ? EARLY_AFTER_CLOSE : AFTER_CLOSE },
  ];
}

export function usMarketStatus(now = Date.now()): UsMarketStatus {
  const today = local(now);
  const calendarKnown = today.year <= CALENDAR_LAST_YEAR;
  const holiday = HOLIDAYS[today.date] ?? null;
  const weekend = today.weekday === "Sat" || today.weekday === "Sun";
  const earlyClose = EARLY_CLOSES.has(today.date);

  let session: UsSession = "closed";
  let closedReason: UsMarketStatus["closedReason"] = weekend ? "weekend" : holiday ? "holiday" : "overnight";
  let nextChange: number | null = null;
  let nextSession: UsSession | null = null;

  if (!weekend && !holiday) {
    for (const bound of sessionBounds(today.date)) {
      if (today.minutes >= bound.from && today.minutes < bound.to) {
        session = bound.session;
        closedReason = null;
        nextChange = zonedTime(today.date, bound.to);
        const index = ["pre", "regular", "after"].indexOf(bound.session);
        nextSession = index < 2 ? (["regular", "after"] as const)[index] : "closed";
        break;
      }
    }
  }

  if (session === "closed") {
    // Next pre-market open: later today if before 4:00 a.m. on a trading day,
    // otherwise the next trading day within the embedded calendar.
    let date = today.date;
    if (!(tradingDay(date) && today.minutes < PRE_OPEN)) date = addDays(date, 1);
    for (let i = 0; i < 10 && Number(date.slice(0, 4)) <= CALENDAR_LAST_YEAR; i++, date = addDays(date, 1)) {
      if (tradingDay(date)) {
        nextChange = zonedTime(date, PRE_OPEN);
        nextSession = "pre";
        break;
      }
    }
  }

  return { session, closedReason, holiday, earlyClose, nextChange, nextSession, calendarKnown };
}

/** Short wall-clock label in New York time, e.g. "9:30 AM ET" or "Mon 4:00 AM ET". */
export function formatEtTime(ms: number, now = Date.now()) {
  const sameDay = local(ms).date === local(now).date;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    hour: "numeric",
    minute: "2-digit",
    ...(sameDay ? {} : { weekday: "short" }),
  }).format(new Date(ms)) + " ET";
}
