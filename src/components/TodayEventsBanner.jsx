import { CalendarDays } from 'lucide-react'

export default function TodayEventsBanner({ calendarDay }) {
  const events = calendarDay?.holiday_name
    ?.split(/\r?\n/)
    .map(event => event.trim())
    .filter(Boolean) || []

  if (!events.length) return null

  return <section className="today-events-banner" aria-label="Today's events">
    <header className="today-events-heading">
      <CalendarDays size={21} aria-hidden="true"/>
      <strong>TODAY'S EVENTS</strong>
    </header>
    <div className="today-events-list">
      {events.map((event, index) => <span key={`${event}-${index}`}>{event}</span>)}
    </div>
  </section>
}
