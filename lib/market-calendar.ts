// The NYSE regular session exactly as FortuneMarketCalendar computes it onchain, so the
// site can say when a market-hours launch opens and closes without trusting a table:
// Monday to Friday, 9:30am to 4:00pm New York time, with US daylight saving time, the
// NYSE's ten holidays and its three 1:00pm early closes. Same integer arithmetic as the
// contract, checked against an independent NYSE calendar. Client-safe.

const DAY = 86_400;
const OPEN_MINUTE = 570;
const CLOSE_MINUTE = 960;
const EARLY_CLOSE_MINUTE = 780;

const div = (a: number, b: number) => Math.floor(a / b);

/** Calendar date of a day counted from 1 January 1970 (Howard Hinnant's civil_from_days). */
export function civilDate(day: number): [year: number, month: number, date: number] {
  const z = day + 719_468;
  const era = div(z, 146_097);
  const doe = z - era * 146_097;
  const yoe = div(doe - div(doe, 1_460) + div(doe, 36_524) - div(doe, 146_096), 365);
  const doy = doe - (365 * yoe + div(yoe, 4) - div(yoe, 100));
  const mp = div(5 * doy + 2, 153);
  const date = doy - div(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, date];
}

/** Days from 1 January 1970 to a date on or after it. */
export function daysFromCivil(year: number, month: number, date: number) {
  const y = month <= 2 ? year - 1 : year;
  const era = div(y, 400);
  const yoe = y - era * 400;
  const doy = div(153 * (month > 2 ? month - 3 : month + 9) + 2, 5) + date - 1;
  return era * 146_097 + yoe * 365 + div(yoe, 4) - div(yoe, 100) + doy - 719_468;
}

const firstSunday = (day: number) => day + ((7 - ((day + 4) % 7)) % 7);

/** Easter Sunday (Gregorian, the anonymous algorithm) as days since 1 January 1970. */
export function easterDay(year: number) {
  const a = year % 19;
  const b = div(year, 100);
  const c = year % 100;
  const h = (19 * a + b - div(b, 4) - div(b - div(b + 8, 25) + 1, 3) + 15) % 30;
  const l = (32 + 2 * (b % 4) + 2 * div(c, 4) - h - (c % 4)) % 7;
  const n = h + l - 7 * div(a + 11 * h + 22 * l, 451) + 114;
  return daysFromCivil(year, div(n, 31), (n % 31) + 1);
}

/** US daylight saving time: 7:00 UTC on the second Sunday of March to 6:00 UTC on the first Sunday of November. */
export function isDaylightTime(timestamp: number) {
  const [year] = civilDate(div(timestamp, DAY));
  const starts = (firstSunday(daysFromCivil(year, 3, 1)) + 7) * DAY + 7 * 3_600;
  const ends = firstSunday(daysFromCivil(year, 11, 1)) * DAY + 6 * 3_600;
  return timestamp >= starts && timestamp < ends;
}

const nthMonday = (date: number, weekday: number, n: number) => weekday === 1 && date > (n - 1) * 7 && date <= n * 7;
const observed = (date: number, weekday: number, holiday: number) =>
  date === holiday || (date + 1 === holiday && weekday === 5) || (date === holiday + 1 && weekday === 1);

/** Why the NYSE is closed on a weekday, or null when it is not a holiday. */
export function holidayName(year: number, month: number, date: number, weekday: number, day: number): string | null {
  if (month === 1) {
    if (date === 1 || (date === 2 && weekday === 1)) return "New Year's Day";
    return nthMonday(date, weekday, 3) ? "Martin Luther King Jr. Day" : null;
  }
  if (month === 2) return nthMonday(date, weekday, 3) ? "Washington's Birthday" : null;
  if (month === 3 || month === 4) return weekday === 5 && day + 2 === easterDay(year) ? "Good Friday" : null;
  if (month === 5) return weekday === 1 && date >= 25 ? "Memorial Day" : null;
  if (month === 6) return year >= 2022 && observed(date, weekday, 19) ? "Juneteenth" : null;
  if (month === 7) return observed(date, weekday, 4) ? "Independence Day" : null;
  if (month === 9) return nthMonday(date, weekday, 1) ? "Labor Day" : null;
  if (month === 11) return weekday === 4 && date >= 22 && date <= 28 ? "Thanksgiving Day" : null;
  if (month === 12) return observed(date, weekday, 25) ? "Christmas Day" : null;
  return null;
}

function isEarlyClose(month: number, date: number, weekday: number) {
  if ((month === 7 && date === 3) || (month === 12 && date === 24)) return weekday >= 1 && weekday <= 4;
  return month === 11 && weekday === 5 && date >= 23 && date <= 29;
}

type Day = { open: number; close: number } | { closed: "weekend" | "holiday"; holiday: string | null };

/** The session on the New York calendar day `day` (days since 1970), as UTC seconds. */
function sessionOn(day: number, observeHolidays: boolean): Day {
  const weekday = (day + 4) % 7;
  if (weekday === 0 || weekday === 6) return { closed: "weekend", holiday: null };
  // The clocks change at 2:00am on Sundays, so a weekday is on one offset all day.
  const offset = isDaylightTime(day * DAY + 13 * 3_600 + 1_800) ? 4 * 3_600 : 5 * 3_600;
  const midnight = day * DAY + offset;
  let close = CLOSE_MINUTE;
  if (observeHolidays) {
    const [year, month, date] = civilDate(day);
    const holiday = holidayName(year, month, date, weekday, day);
    if (holiday) return { closed: "holiday", holiday };
    if (isEarlyClose(month, date, weekday)) close = EARLY_CLOSE_MINUTE;
  }
  return { open: midnight + OPEN_MINUTE * 60, close: midnight + close * 60 };
}

/** Whether the regular session is open at `timestamp`, exactly as the contract decides. */
export function isMarketOpen(timestamp: number, observeHolidays: boolean) {
  if (timestamp < DAY) return false;
  const local = timestamp - (isDaylightTime(timestamp) ? 4 * 3_600 : 5 * 3_600);
  const day = div(local, DAY);
  const weekday = (day + 4) % 7;
  if (weekday === 0 || weekday === 6) return false;
  const minute = div(local % DAY, 60);
  if (minute < OPEN_MINUTE) return false;
  if (!observeHolidays) return minute < CLOSE_MINUTE;
  const [year, month, date] = civilDate(day);
  if (holidayName(year, month, date, weekday, day)) return false;
  return minute < (isEarlyClose(month, date, weekday) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE);
}

export type MarketSession = {
  open: boolean;
  /** When it closes (if open) or next opens (if closed), in UTC seconds. */
  changesAt: number;
  earlyClose: boolean;
  /** Today's holiday when that is why it is closed. */
  holiday: string | null;
};

/** Open or closed at `timestamp`, and when that changes. */
export function marketSession(timestamp: number, observeHolidays: boolean): MarketSession {
  const local = timestamp - (isDaylightTime(timestamp) ? 4 * 3_600 : 5 * 3_600);
  const today = div(local, DAY);
  const session = sessionOn(today, observeHolidays);
  if ("open" in session && timestamp >= session.open && timestamp < session.close) {
    return { open: true, changesAt: session.close, earlyClose: session.close - session.open < (CLOSE_MINUTE - OPEN_MINUTE) * 60, holiday: null };
  }
  const holiday = "closed" in session ? session.holiday : null;
  for (let day = today; day <= today + 14; day += 1) {
    const next = sessionOn(day, observeHolidays);
    if ("open" in next && next.open > timestamp) return { open: false, changesAt: next.open, earlyClose: false, holiday };
  }
  return { open: false, changesAt: timestamp, earlyClose: false, holiday };
}
