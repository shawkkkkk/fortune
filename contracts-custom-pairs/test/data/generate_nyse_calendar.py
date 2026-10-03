"""Reference NYSE calendar for the market-hours launch rule.

Writes nyse-calendar.json from two sources independent of Fortune's own code:
exchange_calendars' XNYS calendar (sessions and 1:00pm early closes) and the IANA
time zone database (New York's UTC offset and daylight-saving changes).

    python3 -m venv .venv && .venv/bin/pip install exchange_calendars==4.13.2
    .venv/bin/python generate_nyse_calendar.py

Each day from FIRST to LAST is one byte: 0 closed, 1 full session, 2 early close,
plus 4 when New York is on daylight time that day.
"""
import datetime as dt
import json
import pathlib
import zoneinfo

import exchange_calendars as xc

FIRST = dt.date(2026, 1, 1)
LAST = dt.date(2045, 12, 31)
NY = zoneinfo.ZoneInfo("America/New_York")
EPOCH = dt.date(1970, 1, 1)

calendar = xc.get_calendar("XNYS", start=FIRST.isoformat(), end=LAST.isoformat())
sessions = {session.date() for session in calendar.sessions}
early = {session.date() for session in calendar.early_closes}

days = bytearray()
day = FIRST
while day <= LAST:
    if day in sessions:
        close = calendar.session_close(day.isoformat()).tz_convert(NY)
        status = 2 if day in early else 1
        assert (close.hour, close.minute) == ((13, 0) if status == 2 else (16, 0)), day
        assert calendar.session_open(day.isoformat()).tz_convert(NY).strftime("%H:%M") == "09:30", day
    else:
        status = 0
    noon = dt.datetime(day.year, day.month, day.day, 12, tzinfo=NY)
    dst = noon.utcoffset() == dt.timedelta(hours=-4)
    assert noon.utcoffset() in (dt.timedelta(hours=-4), dt.timedelta(hours=-5)), day
    days.append(status | (4 if dst else 0))
    day += dt.timedelta(days=1)

# The exact instants daylight time starts and ends each year, from the time zone database.
starts, ends = [], []
for year in range(FIRST.year, LAST.year + 1):
    instant = dt.datetime(year, 1, 1, tzinfo=dt.timezone.utc)
    previous = instant.astimezone(NY).utcoffset()
    while instant.year == year:
        following = (instant + dt.timedelta(hours=1)).astimezone(NY).utcoffset()
        if following != previous:
            (starts if following > previous else ends).append(int((instant + dt.timedelta(hours=1)).timestamp()))
            previous = following
        instant += dt.timedelta(hours=1)

out = {
    "source": f"exchange_calendars {xc.__version__} XNYS and the IANA tz database",
    "firstDay": (FIRST - EPOCH).days,
    "days": "0x" + days.hex(),
    "dstStarts": starts,
    "dstEnds": ends,
}
pathlib.Path(__file__).with_name("nyse-calendar.json").write_text(json.dumps(out, indent=1) + "\n")
print(len(days), "days;", sum(1 for b in days if b & 3 == 1), "full,", sum(1 for b in days if b & 3 == 2), "early")
