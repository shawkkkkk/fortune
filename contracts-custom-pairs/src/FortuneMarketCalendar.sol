// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The New York Stock Exchange's regular session, worked out from a timestamp alone:
///         Monday to Friday, 9:30am to 4:00pm New York time, with US daylight saving time,
///         the NYSE's ten holidays and its three 1:00pm early closes.
/// @dev Pure arithmetic with no owner and no feed, so it keeps working unchanged. It follows the
///      NYSE's standing holiday rules (Rule 7.2). A one-off closure announced at short notice,
///      such as a national day of mourning, cannot be known in advance and is not included.
library FortuneMarketCalendar {
    uint256 internal constant OPEN_MINUTE = 570; // 9:30am
    uint256 internal constant CLOSE_MINUTE = 960; // 4:00pm
    uint256 internal constant EARLY_CLOSE_MINUTE = 780; // 1:00pm

    /// @notice Whether the regular session is open at `timestamp`. With `observeHolidays` false,
    ///         every Monday to Friday is a full session.
    function isOpen(uint256 timestamp, bool observeHolidays) internal pure returns (bool) {
        if (timestamp < 1 days) return false;
        uint256 local = timestamp - (isDaylightTime(timestamp) ? 4 hours : 5 hours);
        uint256 day = local / 1 days;
        uint256 weekday = (day + 4) % 7; // 0 is Sunday; 1 January 1970 was a Thursday.
        if (weekday == 0 || weekday == 6) return false;
        uint256 minute = (local % 1 days) / 60;
        if (minute < OPEN_MINUTE) return false;
        if (!observeHolidays) return minute < CLOSE_MINUTE;
        (uint256 year, uint256 month, uint256 date) = civilDate(day);
        if (isHoliday(year, month, date, weekday, day)) return false;
        return minute < (isEarlyClose(month, date, weekday) ? EARLY_CLOSE_MINUTE : CLOSE_MINUTE);
    }

    /// @notice US daylight saving time: from 2:00am on the second Sunday of March to 2:00am on
    ///         the first Sunday of November, New York time (7:00 and 6:00 UTC).
    function isDaylightTime(uint256 timestamp) internal pure returns (bool) {
        (uint256 year,,) = civilDate(timestamp / 1 days);
        uint256 starts = (_firstSunday(daysFromCivil(year, 3, 1)) + 7) * 1 days + 7 hours;
        uint256 ends = _firstSunday(daysFromCivil(year, 11, 1)) * 1 days + 6 hours;
        return timestamp >= starts && timestamp < ends;
    }

    /// @dev A weekday date (`weekday` 1 to 5) the NYSE is closed for a holiday.
    function isHoliday(uint256 year, uint256 month, uint256 date, uint256 weekday, uint256 day)
        internal
        pure
        returns (bool)
    {
        // New Year's Day (a Saturday one is not observed on the Friday before), then Martin Luther King Jr. Day.
        if (month == 1) return date == 1 || (date == 2 && weekday == 1) || _nthMonday(date, weekday, 3);
        if (month == 2) return _nthMonday(date, weekday, 3); // Washington's Birthday
        if (month == 3 || month == 4) return weekday == 5 && day + 2 == easterDay(year); // Good Friday
        if (month == 5) return weekday == 1 && date >= 25; // Memorial Day
        if (month == 6) return year >= 2022 && _observed(date, weekday, 19); // Juneteenth
        if (month == 7) return _observed(date, weekday, 4); // Independence Day
        if (month == 9) return _nthMonday(date, weekday, 1); // Labor Day
        if (month == 11) return weekday == 4 && date >= 22 && date <= 28; // Thanksgiving
        if (month == 12) return _observed(date, weekday, 25); // Christmas
        return false;
    }

    /// @dev 1:00pm closes: 3 July and 24 December when they fall Monday to Thursday, and the
    ///      Friday after Thanksgiving.
    function isEarlyClose(uint256 month, uint256 date, uint256 weekday) internal pure returns (bool) {
        if ((month == 7 && date == 3) || (month == 12 && date == 24)) return weekday >= 1 && weekday <= 4;
        return month == 11 && weekday == 5 && date >= 23 && date <= 29;
    }

    /// @dev Easter Sunday (Gregorian, the anonymous algorithm) as days since 1 January 1970.
    function easterDay(uint256 year) internal pure returns (uint256) {
        uint256 a = year % 19;
        uint256 b = year / 100;
        uint256 c = year % 100;
        uint256 h = (19 * a + b - b / 4 - (b - (b + 8) / 25 + 1) / 3 + 15) % 30;
        uint256 l = (32 + 2 * (b % 4) + 2 * (c / 4) - h - c % 4) % 7;
        uint256 n = h + l - 7 * ((a + 11 * h + 22 * l) / 451) + 114;
        return daysFromCivil(year, n / 31, n % 31 + 1);
    }

    /// @dev Calendar date of a day counted from 1 January 1970 (Howard Hinnant's civil_from_days).
    function civilDate(uint256 day) internal pure returns (uint256 year, uint256 month, uint256 date) {
        uint256 z = day + 719_468;
        uint256 era = z / 146_097;
        uint256 doe = z - era * 146_097;
        uint256 yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
        uint256 doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        uint256 mp = (5 * doy + 2) / 153;
        date = doy - (153 * mp + 2) / 5 + 1;
        month = mp < 10 ? mp + 3 : mp - 9;
        year = yoe + era * 400 + (month <= 2 ? 1 : 0);
    }

    /// @dev Days from 1 January 1970 to a date on or after it (Howard Hinnant's days_from_civil).
    function daysFromCivil(uint256 year, uint256 month, uint256 date) internal pure returns (uint256) {
        if (month <= 2) year -= 1;
        uint256 era = year / 400;
        uint256 yoe = year - era * 400;
        uint256 doy = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + date - 1;
        return era * 146_097 + yoe * 365 + yoe / 4 - yoe / 100 + doy - 719_468;
    }

    /// @dev The first Sunday on or after `day`.
    function _firstSunday(uint256 day) private pure returns (uint256) {
        return day + (7 - (day + 4) % 7) % 7;
    }

    function _nthMonday(uint256 date, uint256 weekday, uint256 n) private pure returns (bool) {
        return weekday == 1 && date > (n - 1) * 7 && date <= n * 7;
    }

    /// @dev A fixed-date holiday: on the day, on the Friday before when it falls on a Saturday,
    ///      or on the Monday after when it falls on a Sunday.
    function _observed(uint256 date, uint256 weekday, uint256 holiday) private pure returns (bool) {
        return date == holiday || (date + 1 == holiday && weekday == 5) || (date == holiday + 1 && weekday == 1);
    }
}
