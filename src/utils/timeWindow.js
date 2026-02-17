const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const config = require('../config');

dayjs.extend(utc);
dayjs.extend(timezone);

function getCurrentHour() {
  return dayjs().tz(config.timezone).hour();
}

function getCurrentDay() {
  return dayjs().tz(config.timezone).format('ddd').toLowerCase();
}

function isWithinSendWindow(channel) {
  const hour = getCurrentHour();
  const day = getCurrentDay();
  const window = config.sendWindows[channel] || config.sendWindows.sms;

  const isWeekday = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(day);
  const isSaturday = day === 'sat';

  // Only email allowed on Saturday (10am-2pm)
  if (isSaturday) {
    if (channel !== 'email') return false;
    return hour >= 10 && hour < 14;
  }

  // Nothing on Sunday
  if (day === 'sun') return false;

  // Weekday: check window
  return isWeekday && hour >= window.start && hour < window.end;
}

function isWithinStepWindow(sendWindowStart, sendWindowEnd, sendDays) {
  const hour = getCurrentHour();
  const day = getCurrentDay();
  const allowedDays = (sendDays || 'mon,tue,wed,thu,fri').split(',');

  return allowedDays.includes(day) && hour >= sendWindowStart && hour < sendWindowEnd;
}

function getNextValidSendTime(channel, delayHours = 0) {
  const window = config.sendWindows[channel] || config.sendWindows.sms;
  let next = dayjs().tz(config.timezone).add(delayHours, 'hour');

  // Find next valid send time
  for (let i = 0; i < 7; i++) {
    const d = next.add(i, 'day');
    const dayName = d.format('ddd').toLowerCase();
    const isWeekday = ['mon', 'tue', 'wed', 'thu', 'fri'].includes(dayName);
    const isSaturday = dayName === 'sat';

    if (channel !== 'email' && !isWeekday) continue;
    if (channel === 'email' && !isWeekday && !isSaturday) continue;

    let startHour = window.start;
    let endHour = window.end;
    if (isSaturday) { startHour = 10; endHour = 14; }

    if (i === 0) {
      // Same day — check if still within window
      const hour = d.hour();
      if (hour >= startHour && hour < endHour) return d.toISOString();
      if (hour < startHour) return d.hour(startHour).minute(0).second(0).toISOString();
      continue; // Past window, go to next day
    }

    return d.hour(startHour).minute(0).second(0).toISOString();
  }

  // Fallback: tomorrow at start
  return dayjs().tz(config.timezone).add(1, 'day').hour(window.start).minute(0).second(0).toISOString();
}

module.exports = { getCurrentHour, getCurrentDay, isWithinSendWindow, isWithinStepWindow, getNextValidSendTime };
