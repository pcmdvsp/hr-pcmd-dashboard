import { Cake } from 'lucide-react'
import { birthdaysOnDate } from '../utils/birthdayCalendar'
import { today } from '../utils/status'

const birthdayMessage = people => {
  const names = people.map(person => person.full_name)
  if (names.length === 1) return `Happy Birthday, ${names[0]}! Wishing you a wonderful day filled with happiness and success.`
  const lastName = names.at(-1)
  return `Happy Birthday to ${names.slice(0, -1).join(', ')} and ${lastName}! Wishing you all a wonderful day filled with happiness and success.`
}

export default function BirthdayBanner({ employees }) {
  const people = birthdaysOnDate(employees, today())
  if (!people.length) return null
  return <section className="birthday-banner" aria-label="Today's birthdays">
    <span className="birthday-banner-icon" aria-hidden="true"><Cake size={22}/></span>
    <div className="birthday-banner-window"><p>{birthdayMessage(people)}</p></div>
  </section>
}
