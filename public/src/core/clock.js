// Game clock. `t` is whole minutes since Day 1, 00:00. Pure functions only -
// the tick loop lives in game.js so the calendar stays decoupled from player state.
//
// Calendar: 30-day "Abuja months", starting in May (rains are building up),
// Day 1 is a Monday. Months/weekdays drive salary day, rainy season and nightlife.

import { pad2 } from './util.js';

export const START_T = 6 * 60; // 06:00 on Day 1
export const START_MONTH = 4; // May
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const dayIndex = (t) => Math.floor(t / 1440);
export const dayNumber = (t) => dayIndex(t) + 1;
export const minuteOfDay = (t) => t % 1440;
export const hourOf = (t) => Math.floor((t % 1440) / 60);
export const dowOf = (t) => dayIndex(t) % 7; // 0 = Mon
export const isWeekday = (t) => dowOf(t) < 5;
export const startOfDay = (day) => (day - 1) * 1440;

export function monthOf(t) {
  return (START_MONTH + Math.floor(dayIndex(t) / 30)) % 12;
}
export const domOf = (t) => (dayIndex(t) % 30) + 1;

export const isRainySeason = (m) => m >= 3 && m <= 9; // Apr-Oct
export const isHeavyRains = (m) => m >= 5 && m <= 8; // Jun-Sep

/** Rush hour: weekdays 07:00-09:59 and 16:00-19:59. */
export function isPeak(t) {
  if (!isWeekday(t)) return false;
  const h = hourOf(t);
  return (h >= 7 && h < 10) || (h >= 16 && h < 20);
}

export const clockStr = (t) => `${pad2(hourOf(t))}:${pad2(t % 60)}`;
export const dateStr = (t) => `${DOW[dowOf(t)]} ${domOf(t)} ${MONTHS[monthOf(t)]}`;

export function partOfDay(t) {
  const h = hourOf(t);
  if (h < 5) return 'late night';
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  if (h < 21) return 'evening';
  return 'night';
}

/** Minutes from `t` until the next occurrence of `hour:00`. */
export function minutesUntilHour(t, hour) {
  const m = ((hour * 60 - (t % 1440)) + 1440) % 1440;
  return m === 0 ? 1440 : m;
}

/** True when the hour-of-day lies in [from, to), wrapping midnight (e.g. 18 -> 4). */
export function hourIn(t, from, to) {
  const h = hourOf(t);
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
