import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { civilDate, daysFromCivil, easterDay, isDaylightTime, isMarketOpen, marketSession } from "../../lib/market-calendar.ts";

// The same reference the Foundry tests use: exchange_calendars' XNYS calendar and the IANA tz database.
const reference = JSON.parse(readFileSync(new URL("../../contracts-custom-pairs/test/data/nyse-calendar.json", import.meta.url), "utf8"));
const days = Buffer.from(reference.days.slice(2), "hex");
const H = 3_600;
const M = 60;

test("the site's market calendar matches the NYSE reference every day from 2026 to 2045", () => {
  assert.equal(days.length, 7_305);
  for (let i = 0; i < days.length; i += 1) {
    const entry = days[i];
    const status = entry & 3;
    const day = reference.firstDay + i;
    const midnight = day * 86_400 + (entry & 4 ? 4 * H : 5 * H);
    const weekday = (day + 4) % 7 !== 0 && (day + 4) % 7 !== 6;
    const at = (seconds, observe = true) => isMarketOpen(midnight + seconds, observe);
    assert.equal(at(9 * H + 29 * M + 59), false, `before the open, day ${i}`);
    assert.equal(at(9 * H + 30 * M), status !== 0, `the open, day ${i}`);
    assert.equal(at(12 * H + 59 * M + 59), status !== 0, `before an early close, day ${i}`);
    assert.equal(at(13 * H), status === 1, `an early close, day ${i}`);
    assert.equal(at(15 * H + 59 * M + 59), status === 1, `before the close, day ${i}`);
    assert.equal(at(16 * H), false, `the close, day ${i}`);
    assert.equal(at(9 * H + 30 * M, false), weekday, `weekdays when holidays are ignored, day ${i}`);
  }
});

test("daylight time changes at the tz database's exact instants", () => {
  assert.equal(reference.dstStarts.length, 20);
  for (const start of reference.dstStarts) {
    assert.equal(isDaylightTime(start - 1), false);
    assert.equal(isDaylightTime(start), true);
  }
  for (const end of reference.dstEnds) {
    assert.equal(isDaylightTime(end - 1), true);
    assert.equal(isDaylightTime(end), false);
  }
});

test("calendar arithmetic matches known dates", () => {
  assert.equal(easterDay(2026), 20_548);
  assert.equal(easterDay(2038), 24_951);
  assert.equal(easterDay(2285), 115_132);
  for (let day = 0; day < 200_000; day += 997) {
    const [y, m, d] = civilDate(day);
    assert.equal(daysFromCivil(y, m, d), day);
  }
});

test("the next open and close follow the session, weekends, holidays and early closes", () => {
  // Tuesday 19 January 2027, 10:00am EST: open until 4:00pm.
  const tuesday = 1_800_370_800;
  assert.deepEqual(marketSession(tuesday, true), { open: true, changesAt: tuesday + 6 * H, earlyClose: false, holiday: null });
  // That evening: closed until Wednesday 9:30am.
  assert.deepEqual(marketSession(tuesday + 7 * H, true), { open: false, changesAt: tuesday + 23 * H + 30 * M, earlyClose: false, holiday: null });
  // Saturday: closed until Monday 9:30am.
  assert.equal(marketSession(tuesday + 4 * 86_400, true).changesAt, tuesday + 6 * 86_400 - 30 * M);
  // Martin Luther King Jr. Day 2027: a holiday unless holidays are ignored.
  const mlk = 1_800_284_400;
  assert.deepEqual(marketSession(mlk, true), { open: false, changesAt: mlk + 86_400 - 30 * M, earlyClose: false, holiday: "Martin Luther King Jr. Day" });
  assert.equal(marketSession(mlk, false).open, true);
  // The day after Thanksgiving 2027 closes at 1:00pm.
  const blackFriday = 1_827_241_200; // 26 November 2027, 10:00am EST
  assert.deepEqual(marketSession(blackFriday, true), { open: true, changesAt: blackFriday + 3 * H, earlyClose: true, holiday: null });
  // Across the March 2027 clock change: Friday 4:00pm EST to Monday 9:30am EDT, at 13:30 UTC instead of 14:30.
  assert.equal(marketSession(1_804_885_200, true).changesAt, 1_805_117_400);
});
