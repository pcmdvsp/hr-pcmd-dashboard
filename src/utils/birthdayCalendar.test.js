import test from 'node:test'
import assert from 'node:assert/strict'
import { birthdayKey, birthdaysOnDate, buildMonthGrid, moveMonth } from './birthdayCalendar.js'

test('moves across year boundaries', () => {
  assert.equal(moveMonth('2026-01', -1), '2025-12')
  assert.equal(moveMonth('2026-12', 1), '2027-01')
})

test('builds a Monday-first calendar and preserves work calendar data', () => {
  const grid = buildMonthGrid('2026-09', [{ date: '2026-09-02', day_type: 'holiday', holiday_name: 'National Day' }])
  assert.equal(grid[0], null)
  assert.equal(grid[1].date, '2026-09-01')
  assert.equal(grid[2].holiday_name, 'National Day')
  assert.equal(grid.filter(Boolean).length, 30)
})

test('matches birthdays by month and day without exposing the year', () => {
  const profiles = [
    { id: 'one', full_name: 'Employee One', birth_date: '1986-09-22' },
    { id: 'two', full_name: 'Employee Two', birth_date: '1990-09-23' },
  ]
  assert.equal(birthdayKey(profiles[0].birth_date), '09-22')
  assert.deepEqual(birthdaysOnDate(profiles, '2026-09-22').map(person => person.id), ['one'])
})
