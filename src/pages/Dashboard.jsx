import { useEffect, useMemo, useState } from 'react'
import '../dashboard.css'
import './Dashboard.css'
import DepartmentCard from '../components/DepartmentCard'
import StatusFilter from '../components/StatusFilter'
import SearchBox from '../components/SearchBox'
import StatusForm from '../components/StatusForm'
import StatusOverview from '../components/StatusOverview'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import { formatDateTime } from '../utils/status'

const formatHeaderDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(value)
const formatHeaderTime = value => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(value)
const nonWorkingLabel = day => ({ weekend: 'Weekend', holiday: 'Holiday', special_leave: 'Special leave' }[day.day_type] || 'Non-working day')

export default function Dashboard({ profile, data, onSignOut, goAdmin, goMonthly, goMeeting, goUpdate, goCalendar, onDateChange }) {
  const { employees, departments, calendarDay, isWorkingDay, loading, error, date, reload } = data
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [edit, setEdit] = useState(null)
  const [resetPassword, setResetPassword] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => { const interval = window.setInterval(() => setNow(new Date()), 1000); return () => window.clearInterval(interval) }, [])
  const dashboardEmployees = useMemo(() => employees.map(employee => employee.displayStatus === 'meeting' ? { ...employee, displayStatus: 'working' } : employee), [employees])
  const visible = useMemo(() => dashboardEmployees.filter(employee => (filter === 'all' || employee.displayStatus === filter) && `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(query.toLowerCase())), [dashboardEmployees, filter, query])
  const leaders = departmentFilter === 'all' || departmentFilter === 'leadership' ? visible.filter(employee => !employee.department_id) : []
  const visibleDepartments = useMemo(() => departments
    .filter(department => departmentFilter === 'all' || department.id === departmentFilter)
    .map(department => ({ ...department, employees: visible.filter(employee => employee.department_id === department.id) }))
    .filter(department => department.employees.length > 0), [departments, visible, departmentFilter])
  const nonWorkingEmployees = useMemo(() => visible.filter(employee => employee.displayStatus === 'business_trip' || employee.isOvertime), [visible])
  const nonWorkingLeaders = useMemo(() => nonWorkingEmployees.filter(employee => !employee.department_id), [nonWorkingEmployees])
  const nonWorkingDepartments = useMemo(() => departments
    .filter(department => departmentFilter === 'all' || department.id === departmentFilter)
    .map(department => ({ ...department, employees: nonWorkingEmployees.filter(employee => employee.department_id === department.id) }))
    .filter(department => department.employees.length > 0), [departments, nonWorkingEmployees, departmentFilter])
  const latest = employees.map(employee => employee.daily?.updated_at).filter(Boolean).sort().at(-1)
  const nonWorkingMessage = calendarDay.holiday_name ? `${nonWorkingLabel(calendarDay)}: ${calendarDay.holiday_name}` : nonWorkingLabel(calendarDay)

  return <main className="app-shell">
    <header className="topbar operations-header">
      <div><p className="eyebrow">PCMD - Vietsovpetro JV</p><h1>WORKING STATUS DASHBOARD</h1><p className="subtle">Last updated: {formatDateTime(latest)}</p></div>
      <div className="header-actions-wrap"><div className="top-actions"><span className="user-chip">{profile.full_name}</span><button className="secondary-button" onClick={goUpdate}>My Status</button>{profile.role === 'admin' && <><button className="secondary-button" onClick={goAdmin}>Admin</button><button className="secondary-button" onClick={goCalendar}>Work calendar</button><button className="secondary-button reset-button" onClick={() => setResetPassword(true)}>Reset password</button></>}<button className="text-button" onClick={onSignOut}>Sign out</button></div><time className="header-clock">{formatHeaderDate(now)}<br/><b>{formatHeaderTime(now)}</b></time></div>
    </header>
    <nav className="dashboard-navigation" aria-label="Dashboard pages"><button className="secondary-button" onClick={goMonthly}>Monthly statistics</button><button className="secondary-button" onClick={goMeeting}>Meeting Info</button></nav>
    <section className="toolbar"><SearchBox value={query} onChange={setQuery}/><label className="dashboard-date">Display date<input type="date" value={date} onChange={event => onDateChange(event.target.value)} /></label><StatusFilter value={filter} onChange={setFilter} departmentValue={departmentFilter} onDepartmentChange={setDepartmentFilter} departments={departments}/></section>
    {error && <p className="notice error">{error}</p>}
    {loading ? <p className="loading">Loading data...</p> : !isWorkingDay ? <>
      <section className="dashboard-empty non-working-dashboard"><span>◌</span><h2>{nonWorkingMessage}</h2></section>
      {nonWorkingLeaders.length > 0 && <section className="leadership-section"><div className="leadership-list"><DepartmentCard department={{ name: 'Leadership' }} employees={nonWorkingLeaders} editable={profile.role === 'admin'} onEmployeeClick={setEdit} nonWorking/></div></section>}
      <section className="department-grid">{nonWorkingDepartments.map(department => <DepartmentCard key={department.id} department={department} employees={department.employees} editable={profile.role === 'admin'} onEmployeeClick={setEdit} nonWorking/>)}</section>
      {nonWorkingEmployees.length === 0 && <p className="empty">No employees are working or on business trips.</p>}
    </> : <>
      <StatusOverview employees={dashboardEmployees}/>
      {leaders.length > 0 && <section className="leadership-section"><div className="leadership-list"><DepartmentCard department={{ name: 'Leadership' }} employees={leaders} editable={profile.role === 'admin'} onEmployeeClick={setEdit}/></div></section>}
      <section className="department-grid">{visibleDepartments.map(department => <DepartmentCard key={department.id} department={department} employees={department.employees} editable={profile.role === 'admin'} onEmployeeClick={setEdit}/>)}</section>
      {visible.length === 0 && <div className="dashboard-empty"><span>◌</span><p>No matching employees found.</p></div>}
    </>}
    {edit && <div className="modal-backdrop"><div className="modal"><StatusForm employee={edit} onSaved={reload} onClose={() => setEdit(null)}/></div></div>}
    {resetPassword && <ResetPasswordDialog employees={employees} onClose={() => setResetPassword(false)} />}
  </main>
}
