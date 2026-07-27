import { useState } from 'react'
import DepartmentCard from '../components/DepartmentCard'
import StatusForm from '../components/StatusForm'
import SearchBox from '../components/SearchBox'
import { showSuccessAlert } from '../components/SuccessAlert'
import { enablePushNotifications, pushSupported, sendTestPushNotification } from '../utils/pushNotifications'

export default function AdminPage({ data, profile, goBack }) {
  const { employees, departments, date, reload } = data
  const [query, setQuery] = useState('')
  const [edit, setEdit] = useState(null)
  const [pushMessage, setPushMessage] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const shown = employees.filter(employee => `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(query.toLowerCase()))
  const managementBoard = shown.filter(employee => !employee.department_id)
  const enablePush = async () => {
    setPushBusy(true); setPushMessage('')
    try { await enablePushNotifications(profile.id); setPushMessage('Browser notifications are enabled for this device.'); showSuccessAlert('Browser notifications are enabled.') }
    catch (error) { setPushMessage(error.message || 'Unable to enable browser notifications.') }
    setPushBusy(false)
  }
  const sendTestPush = async () => {
    setPushBusy(true); setPushMessage('')
    try { await sendTestPushNotification(); setPushMessage('Test notification sent to this device.'); showSuccessAlert('Test notification sent.') }
    catch (error) { setPushMessage(error.message || 'Unable to send the test notification.') }
    setPushBusy(false)
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">SYSTEM ADMINISTRATION</p><h1>Employees & status</h1></div>
      <button className="secondary-button" onClick={goBack}>← Back to dashboard</button>
    </header>
    <section className="admin-panel">
      <SearchBox value={query} onChange={setQuery}/>
      <p>Click any employee to update their status, including Management Board members. Adding or editing profiles and resetting passwords must be done through the Supabase Dashboard or a secured Edge Function.</p>
      <section className="push-test-panel">
        <div><p className="eyebrow">BROWSER PUSH NOTIFICATIONS</p><b>Windows notification test</b><small>Enable notifications for this browser, then send a test notification to this admin account only.</small></div>
        <div><button className="secondary-button" disabled={pushBusy || !pushSupported()} onClick={enablePush}>Enable notifications</button><button className="primary-button" disabled={pushBusy || !pushSupported()} onClick={sendTestPush}>{pushBusy ? 'Working...' : 'Send test notification'}</button></div>
        {!pushSupported() && <p className="form-error">This browser does not support push notifications.</p>}
        {pushMessage && <p className={pushMessage.startsWith('Unable') || pushMessage.startsWith('Notification permission') || pushMessage.startsWith('The VAPID') ? 'form-error' : 'form-success'}>{pushMessage}</p>}
      </section>
      {managementBoard.length > 0 && <section className="leadership-section">
        <div className="leadership-list"><DepartmentCard department={{ name: 'Management Board' }} employees={managementBoard} editable onEmployeeClick={setEdit}/></div>
      </section>}
      <div className="department-grid">{departments.map(department => <DepartmentCard key={department.id} department={department} employees={shown.filter(employee => employee.department_id === department.id)} editable onEmployeeClick={setEdit}/>)}</div>
    </section>
    {edit && <div className="modal-backdrop"><div className="modal"><StatusForm employee={edit} initialDate={date} canEditHistory onSaved={reload} onClose={() => setEdit(null)}/></div></div>}
  </main>
}
