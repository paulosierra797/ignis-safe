const MANILA_TIME_ZONE = 'Asia/Manila';

// Returns the current date as a YYYY-MM-DD string in the given IANA timezone.
// Using Intl.DateTimeFormat (not new Date().toISOString()) avoids the UTC
// date shifting that happens near midnight for timezones ahead of UTC.
export const getTodayIsoInTimeZone = (timeZone = MANILA_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const lookup = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

export const getManilaToday = () => getTodayIsoInTimeZone(MANILA_TIME_ZONE);

// Returns the YYYY-MM calendar month of a date (or date string) in the given
// IANA timezone, or null if the value is missing/invalid.
export const getMonthKeyInTimeZone = (value, timeZone = MANILA_TIME_ZONE) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);

  const lookup = {};
  for (const part of parts) {
    lookup[part.type] = part.value;
  }

  return `${lookup.year}-${lookup.month}`;
};

export { MANILA_TIME_ZONE };
