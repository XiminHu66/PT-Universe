// Published NYSE US equities calendar, including 13:00 ET closes.
// https://www.nyse.com/trade/hours-calendars
const holidays = {
  2026: '01-01 01-19 02-16 04-03 05-25 06-19 07-03 09-07 11-26 12-25',
  2027: '01-01 01-18 02-15 03-26 05-31 06-18 07-05 09-06 11-25 12-24',
  2028: '01-17 02-21 04-14 05-29 06-19 07-04 09-04 11-23 12-25'
};
const early = new Set(['2026-11-27', '2026-12-24', '2027-11-26', '2028-07-03', '2028-11-24']);
const eastern = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
});

function marketClock(instant) {
  const date = new Date(instant);
  if (!instant || !Number.isFinite(date.getTime())) return null;
  const {year, month, day, hour, minute} = Object.fromEntries(eastern.formatToParts(date).map(part => [part.type, part.value]));
  return {date: `${year}-${month}-${day}`, minutes: Number(hour) * 60 + Number(minute)};
}

function shift(day, offset) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function close(day) {
  const closed = holidays[day.slice(0, 4)];
  if (!closed) return null;
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6 || closed.split(' ').includes(day.slice(5))) return 0;
  return early.has(day) ? 780 : 960;
}

function marketDay(day, step) {
  for (let date = day; ; date = shift(date, step)) {
    const end = close(date);
    if (end === null) return null;
    if (end > 0) return date;
  }
}

export function marketSessions(now = Date.now()) {
  const {date, minutes} = marketClock(now);
  const end = close(date);
  if (end === null) return null;
  const upcoming = end > minutes;
  return {
    open: upcoming && minutes >= 570,
    start: marketDay(upcoming ? date : shift(date, 1), 1),
    completed: marketDay(end > 0 && !upcoming ? date : shift(date, -1), -1)
  };
}

export function reviewWindow(quoteAt, now = Date.now()) {
  const market = marketSessions(now);
  const quote = marketClock(quoteAt);
  if (!market?.start || !market.completed || !quote) return null;
  if (quote.date < market.completed || Date.parse(quoteAt) > now + 5 * 60000) return null;
  let end = market.start;
  for (let i = 1; i < 5 && end; i++) end = marketDay(shift(end, 1), 1);
  return end ? {start: market.start, end} : null;
}

export function showDate(date) {
  return date.slice(0, 4) + '年' + Number(date.slice(5, 7)) + '月' + Number(date.slice(8, 10)) + '日';
}

export function showWindow(start, end) {
  if (start === end) return showDate(start);
  return showDate(start) + ' – ' + (start.slice(0, 4) === end.slice(0, 4) ? showDate(end).split('年')[1] : showDate(end));
}
