import { useState } from 'react'
import StatusForm from '../components/StatusForm'
import MyScheduleOverview from '../components/MyScheduleOverview'

export default function UpdateStatusPage({ profile, goBack }) {
  const [scheduleVersion, setScheduleVersion] = useState(0)
  return <main className="auth-layout"><section className="auth-card update-card"><header className="update-status-header"><div><p className="eyebrow">WORK STATUS</p><h1>My Status</h1></div>{goBack && <button className="secondary-button" onClick={goBack}>← Back to dashboard</button>}</header><MyScheduleOverview key={scheduleVersion} employeeId={profile.id}/><p className="status-form-hint">Select a status and the date range to update your status.</p><StatusForm employee={profile} onSaved={() => setScheduleVersion(version => version + 1)} /></section></main>
}
