import { today } from './status.js'

export const currentMonth = () => today().slice(0, 7)

export const moveMonth = (month, amount) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export const monthBounds = month => {
  const next = moveMonth(month, 1)
  return { start: `${month}-01`, end: `${next}-01` }
}

export const buildMonthGrid = (month, calendarRows = []) => {
  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const firstWeekday = (new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay() + 6) % 7
  const calendarByDate = new Map(calendarRows.map(day => [day.date, day]))
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const dayNumber = index + 1
    const date = `${month}-${String(dayNumber).padStart(2, '0')}`
    const weekday = new Date(Date.UTC(year, monthNumber - 1, dayNumber)).getUTCDay()
    return calendarByDate.get(date) || {
      date,
      day_type: weekday === 0 || weekday === 6 ? 'weekend' : 'working_day',
      holiday_name: null,
    }
  })
  return [...Array(firstWeekday).fill(null), ...days]
}

export const birthdayKey = date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  ? date.slice(5)
  : null

export const groupBirthdays = profiles => (profiles || []).reduce((groups, profile) => {
  const key = birthdayKey(profile.birth_date)
  if (!key) return groups
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(profile)
  return groups
}, new Map())

export const birthdaysOnDate = (profiles, date = today()) =>
  groupBirthdays(profiles).get(date.slice(5)) || []
