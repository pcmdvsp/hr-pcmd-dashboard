import StatusForm from '../components/StatusForm'

export default function UpdateStatusPage({ profile }) {
  return <main className="auth-layout"><section className="auth-card update-card"><header><p className="eyebrow">WORK STATUS</p><h1>Update status</h1><p>Select a status and the date range to apply it to.</p></header><StatusForm employee={profile} /></section></main>
}
