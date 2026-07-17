const escapeIcsText = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const toUtcIcs = (date, time) => new Date(`${date}T${String(time || '00:00').slice(0, 5)}:00+07:00`).toISOString().replace('.000', '').replace(/[-:]/g, '')
const nowUtcIcs = () => new Date().toISOString().replace('.000', '').replace(/[-:]/g, '')
const safeFilename = value => String(value || 'meeting').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()

export function downloadOutlookCalendar(meeting, organizerName) {
  const summary = meeting.content || 'Meeting'
  const description = `${organizerName || 'The meeting organizer'} invited you to the meeting!\n\n${summary}`
  const calendar = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HR Status Dashboard//Meeting Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', `UID:${meeting.id}@hr-status-dashboard`, `DTSTAMP:${nowUtcIcs()}`, `DTSTART:${toUtcIcs(meeting.date, meeting.start_time)}`, `DTEND:${toUtcIcs(meeting.date, meeting.end_time)}`, `SUMMARY:${escapeIcsText(summary)}`, `DESCRIPTION:${escapeIcsText(description)}`, `LOCATION:${escapeIcsText(meeting.location)}`, 'STATUS:CONFIRMED', 'TRANSP:OPAQUE', 'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', `DESCRIPTION:${escapeIcsText(`Reminder: ${summary}`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar;charset=utf-8' })); link.download = `${safeFilename(summary)}-${meeting.date}.ics`; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(link.href)
}
