const MS_PER_DAY = 86400000;
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const pad = (n) => String(n).padStart(2, '0');

export function todayISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toUTC(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / MS_PER_DAY);
}

export function addDays(iso, n) {
  return new Date(toUTC(iso) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

const lastDayOfMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const fullYear = (y) => (y < 100 ? 2000 + y : y);

/**
 * Parses common pharmacy date formats into YYYY-MM-DD.
 * Supports YYYY-MM-DD, DD/MM/YYYY (Indian order), MM/YYYY, MM/YY and "Mar-2027".
 * Month-only expiry dates resolve to the last day of that month.
 */
export function parseDate(input) {
  if (input == null) return null;
  if (input instanceof Date && !isNaN(input)) return todayISO(input);
  const s = String(input).trim();
  if (!s) return null;

  let y, mo, d, m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [d, mo, y] = [+m[1], +m[2], fullYear(+m[3])];
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{2}|\d{4})$/))) {
    [mo, y] = [+m[1], fullYear(+m[2])];
    if (mo >= 1 && mo <= 12) d = lastDayOfMonth(y, mo);
  } else if ((m = s.match(/^([a-z]{3})[a-z]*[-/.\s]+(\d{2}|\d{4})$/i))) {
    mo = MONTHS[m[1].toLowerCase()];
    y = fullYear(+m[2]);
    if (mo) d = lastDayOfMonth(y, mo);
  } else {
    return null;
  }
  if (!mo || mo < 1 || mo > 12 || !d || d < 1 || d > lastDayOfMonth(y, mo)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}
