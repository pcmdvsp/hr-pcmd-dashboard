import { useCallback, useEffect, useState } from 'react'
import DepartmentCard from '../components/DepartmentCard'
import StatusForm from '../components/StatusForm'
import SearchBox from '../components/SearchBox'
import { showSuccessAlert } from '../components/SuccessAlert'
import { supabase } from '../lib/supabaseClient'
import { enablePushNotifications, pushSupported, sendTestPushNotification } from '../utils/pushNotifications'

export default function AdminPage({ data, profile, goBack }) {
  const { employees, departments, date, reload } = data
  const [query, setQuery] = useState('')
  const [edit, setEdit] = useState(null)
  const [pushMessage, setPushMessage] = useState('')
  const [pushBusy, setPushBusy] = useState(false)
  const [vspBusy, setVspBusy] = useState(false)
  const [vspResult, setVspResult] = useState(null)
  const [vspError, setVspError] = useState('')
  const [vspLeaveDate, setVspLeaveDate] = useState('')
  const [meetingBusy, setMeetingBusy] = useState(false)
  const [meetingResult, setMeetingResult] = useState(null)
  const [meetingError, setMeetingError] = useState('')
  const [meetingDate, setMeetingDate] = useState('')
  const [businessTripBusy, setBusinessTripBusy] = useState(false)
  const [businessTripResult, setBusinessTripResult] = useState(null)
  const [businessTripError, setBusinessTripError] = useState('')
  const [meetingSyncLogs, setMeetingSyncLogs] = useState([])
  const [meetingSyncLogsBusy, setMeetingSyncLogsBusy] = useState(false)
  const [meetingSyncLogsError, setMeetingSyncLogsError] = useState('')
  const [leaveSyncLogs, setLeaveSyncLogs] = useState([])
  const [leaveSyncLogsBusy, setLeaveSyncLogsBusy] = useState(false)
  const [leaveSyncLogsError, setLeaveSyncLogsError] = useState('')
  const shown = employees.filter(employee => `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(query.toLowerCase()))
  const managementBoard = shown.filter(employee => !employee.department_id)
  const loadMeetingSyncLogs = useCallback(async () => {
    setMeetingSyncLogsBusy(true); setMeetingSyncLogsError('')
    const { data: logs, error } = await supabase
      .from('vsp_meeting_sync_logs')
      .select('id,mode,target_date,status,upstream_meeting_count,matched_meeting_count,created_count,unchanged_count,failed_count,skipped_attendees,errors,started_at,finished_at,duration_ms')
      .order('started_at', { ascending: false })
      .limit(20)
    if (error) setMeetingSyncLogsError(error.message)
    else setMeetingSyncLogs(logs || [])
    setMeetingSyncLogsBusy(false)
  }, [])
  useEffect(() => { void loadMeetingSyncLogs() }, [loadMeetingSyncLogs])
  const loadLeaveSyncLogs = useCallback(async () => {
    setLeaveSyncLogsBusy(true); setLeaveSyncLogsError('')
    const { data: logs, error } = await supabase
      .from('vsp_leave_sync_logs')
      .select('id,mode,target_date,status,upstream_record_count,matched_record_count,created_day_count,updated_day_count,unchanged_day_count,notification_count,synced_period_count,failed_count,skipped,errors,started_at,finished_at,duration_ms')
      .order('started_at', { ascending: false })
      .limit(20)
    if (error) setLeaveSyncLogsError(error.message)
    else setLeaveSyncLogs(logs || [])
    setLeaveSyncLogsBusy(false)
  }, [])
  useEffect(() => { void loadLeaveSyncLogs() }, [loadLeaveSyncLogs])
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
  const testVspLeave = async (dryRun = false) => {
    setVspBusy(true); setVspResult(null); setVspError('')
    const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession()
    const accessToken = sessionData?.session?.access_token
    if (sessionError || !accessToken) {
      setVspError('Your dashboard session has expired. Please sign out and sign in again.')
      setVspBusy(false)
      return
    }
    const { data: result, error } = await supabase.functions.invoke('sync-vsp-leave', {
      body: { date: vspLeaveDate, dryRun },
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (error) {
      let message = error.message || 'Unable to test the VSP leave API.'
      try {
        const details = await error.context?.json()
        if (details?.error) message = details.error
        if (details) setVspResult(details)
      } catch { /* Keep the function client error above. */ }
      setVspError(message)
    } else if (!result?.success) {
      setVspError(result?.error || 'The VSP leave API test failed.')
    } else {
      setVspResult(result)
      const raw = result?.rawResponse
      const count = Array.isArray(raw) ? raw.length : raw?.paginatedList?.length
      const changedDays = (result?.sync?.createdDayCount ?? 0) + (result?.sync?.updatedDayCount ?? 0)
      showSuccessAlert(dryRun
        ? `VSP leave test returned${Number.isFinite(count) ? ` ${count} approved record(s)` : ' JSON data'}. No data was synchronized.`
        : `VSP leave API returned${Number.isFinite(count) ? ` ${count} record(s)` : ' JSON data'} and synchronized ${changedDays} leave day(s).`)
      if (!dryRun && changedDays) await reload()
    }
    setVspBusy(false)
  }
  const getVspMeetingInfo = async (dryRun = false) => {
    setMeetingBusy(true); setMeetingResult(null); setMeetingError('')
    const { data: result, error } = await supabase.functions.invoke('test-vsp-meeting-info', { body: { date: meetingDate, dryRun } })
    if (error) {
      let message = error.message || 'Unable to test VSP meeting information.'
      try {
        const details = await error.context?.json()
        if (details?.error) message = details.error
      } catch { /* Keep the function client error above. */ }
      setMeetingError(message)
    } else {
      setMeetingResult(result)
      if (dryRun) {
        showSuccessAlert(`VSP meeting test returned ${result?.recordCount ?? 0} matching meeting(s). No data was synchronized.`)
      } else {
        const created = result?.sync?.createdCount ?? 0
        const unchanged = result?.sync?.unchangedCount ?? 0
        const failed = result?.sync?.failedCount ?? 0
        showSuccessAlert(`VSP meetings synced: ${created} created, ${unchanged} unchanged${failed ? `, ${failed} failed` : ''}.`)
      }
    }
    setMeetingBusy(false)
  }
  const testVspBusinessTripInfo = async () => {
    setBusinessTripBusy(true); setBusinessTripResult(null); setBusinessTripError('')
    const { data: result, error } = await supabase.functions.invoke('test-vsp-business-trip-info', { body: {} })
    if (error) {
      let message = error.message || 'Unable to test VSP business trip information.'
      try {
        const details = await error.context?.json()
        if (details?.error) message = details.error
      } catch { /* Keep the function client error above. */ }
      setBusinessTripError(message)
    } else {
      setBusinessTripResult(result)
      showSuccessAlert(`VSP HR returned ${result?.recordCount ?? 0} business trip record(s).`)
    }
    setBusinessTripBusy(false)
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
      <section className="push-test-panel vsp-action-panel">
        <div><p className="eyebrow">VSP LEAVE INFORMATION</p><b>Read approved VSP leave data</b><small>Get and synchronize approved leave, or run a JSON-only test without saving data.</small></div>
        <div className="vsp-date-field">
          <label htmlFor="vsp-leave-test-date">Approval date (optional)</label>
          <input id="vsp-leave-test-date" type="date" value={vspLeaveDate} onChange={event => setVspLeaveDate(event.target.value)} disabled={vspBusy} aria-describedby="vsp-leave-test-date-help" />
          <small id="vsp-leave-test-date-help">Find records whose ngayKy is on this date. Leave blank to use today in Vietnam (UTC+7).</small>
        </div>
        <div className="vsp-action-buttons"><button className="primary-button vsp-get-button" disabled={vspBusy} onClick={() => testVspLeave(false)}>{vspBusy ? 'Working...' : 'Get VSP leave info'}</button><button className="secondary-button" disabled={vspBusy} onClick={() => testVspLeave(true)}>{vspBusy ? 'Working...' : 'Test VSP leave'}</button></div>
        {vspError && <p className="form-error">{vspError}</p>}
        {vspResult && <pre className="vsp-test-result">{JSON.stringify(vspResult, null, 2)}</pre>}
      </section>
      <section className="meeting-sync-log-panel">
        <header>
          <div><p className="eyebrow">VSP LEAVE SYNC HISTORY</p><b>Recent automatic scans</b><small>Latest 20 scheduler runs only. Manual Get/Test requests are not logged.</small></div>
          <button className="secondary-button" type="button" disabled={leaveSyncLogsBusy} onClick={loadLeaveSyncLogs}>{leaveSyncLogsBusy ? 'Loading...' : 'Refresh logs'}</button>
        </header>
        {leaveSyncLogsError && <p className="form-error">{leaveSyncLogsError}</p>}
        {!leaveSyncLogsBusy && !leaveSyncLogsError && leaveSyncLogs.length === 0 && <p className="empty">No automatic leave scans have been logged yet.</p>}
        {leaveSyncLogs.length > 0 && <div className="meeting-sync-log-table-wrap"><table className="meeting-sync-log-table">
          <thead><tr><th>Started</th><th>Target date</th><th>Status</th><th>VSP</th><th>Approved</th><th>Created</th><th>Updated</th><th>Unchanged</th><th>Notifications</th><th>Failed</th><th>Details</th></tr></thead>
          <tbody>{leaveSyncLogs.map(log => <tr key={log.id}>
            <td>{new Date(log.started_at).toLocaleString('en-GB')}</td><td>{log.target_date}</td><td><span className={`sync-log-status is-${log.status}`}>{log.status}</span><small>{log.mode} · {log.duration_ms} ms</small></td>
            <td>{log.upstream_record_count}</td><td>{log.matched_record_count}</td><td>{log.created_day_count}</td><td>{log.updated_day_count}</td><td>{log.unchanged_day_count}</td><td>{log.notification_count}</td><td>{log.failed_count}</td>
            <td>{(log.errors?.length || log.skipped?.length) ? <details><summary>JSON</summary><pre className="vsp-test-result">{JSON.stringify({ errors: log.errors, skipped: log.skipped }, null, 2)}</pre></details> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <section className="push-test-panel vsp-action-panel">
        <div><p className="eyebrow">VSP EOFFICE MEETING INFORMATION</p><b>Read Ban QLHĐDK meeting information</b><small>Get and synchronize matching meetings, or run a JSON-only test without saving data.</small></div>
        <div className="vsp-date-field">
          <label htmlFor="vsp-meeting-test-date">Test date (optional)</label>
          <input id="vsp-meeting-test-date" type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} disabled={meetingBusy} aria-describedby="vsp-meeting-test-date-help" />
          <small id="vsp-meeting-test-date-help">Leave blank to use today in Vietnam (UTC+7).</small>
        </div>
        <div className="vsp-action-buttons"><button className="primary-button vsp-get-button" disabled={meetingBusy} onClick={() => getVspMeetingInfo(false)}>{meetingBusy ? 'Working...' : 'Get VSP meeting info'}</button><button className="secondary-button" disabled={meetingBusy} onClick={() => getVspMeetingInfo(true)}>{meetingBusy ? 'Working...' : 'Test VSP meeting'}</button></div>
        {meetingError && <p className="form-error">{meetingError}</p>}
        {meetingResult && <pre className="vsp-test-result">{JSON.stringify(meetingResult, null, 2)}</pre>}
      </section>
      <section className="meeting-sync-log-panel">
        <header>
          <div><p className="eyebrow">VSP MEETING SYNC HISTORY</p><b>Recent automatic scans</b><small>Latest 20 scheduler runs. Session credentials and tokens are never stored.</small></div>
          <button className="secondary-button" type="button" disabled={meetingSyncLogsBusy} onClick={loadMeetingSyncLogs}>{meetingSyncLogsBusy ? 'Loading...' : 'Refresh logs'}</button>
        </header>
        {meetingSyncLogsError && <p className="form-error">{meetingSyncLogsError}</p>}
        {!meetingSyncLogsBusy && !meetingSyncLogsError && meetingSyncLogs.length === 0 && <p className="empty">No automatic meeting scans have been logged yet.</p>}
        {meetingSyncLogs.length > 0 && <div className="meeting-sync-log-table-wrap"><table className="meeting-sync-log-table">
          <thead><tr><th>Started</th><th>Target date</th><th>Status</th><th>VSP</th><th>Matched</th><th>Created</th><th>Unchanged</th><th>Failed</th><th>Details</th></tr></thead>
          <tbody>{meetingSyncLogs.map(log => <tr key={log.id}>
            <td>{new Date(log.started_at).toLocaleString('en-GB')}</td><td>{log.target_date}</td><td><span className={`sync-log-status is-${log.status}`}>{log.status}</span><small>{log.mode} · {log.duration_ms} ms</small></td>
            <td>{log.upstream_meeting_count}</td><td>{log.matched_meeting_count}</td><td>{log.created_count}</td><td>{log.unchanged_count}</td><td>{log.failed_count}</td>
            <td>{(log.errors?.length || log.skipped_attendees?.length) ? <details><summary>JSON</summary><pre className="vsp-test-result">{JSON.stringify({ errors: log.errors, skippedAttendees: log.skipped_attendees }, null, 2)}</pre></details> : '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <section className="push-test-panel">
        <div><p className="eyebrow">TEMPORARY VSP HR TEST</p><b>Read business trip information</b><small>Calls the authenticated test-vsp-business-trip-info Edge Function for employee 18351. No data is saved.</small></div>
        <div><button className="primary-button" disabled={businessTripBusy} onClick={testVspBusinessTripInfo}>{businessTripBusy ? 'Testing...' : 'Test VSP business trip info'}</button></div>
        {businessTripError && <p className="form-error">{businessTripError}</p>}
        {businessTripResult && <pre className="vsp-test-result">{JSON.stringify(businessTripResult, null, 2)}</pre>}
      </section>
      {managementBoard.length > 0 && <section className="leadership-section">
        <div className="leadership-list"><DepartmentCard department={{ name: 'Management Board' }} employees={managementBoard} editable onEmployeeClick={setEdit}/></div>
      </section>}
      <div className="department-grid">{departments.map(department => <DepartmentCard key={department.id} department={department} employees={shown.filter(employee => employee.department_id === department.id)} editable onEmployeeClick={setEdit}/>)}</div>
    </section>
    {edit && <div className="modal-backdrop"><div className="modal"><StatusForm employee={edit} initialDate={date} canEditHistory onSaved={reload} onClose={() => setEdit(null)}/></div></div>}
  </main>
}
