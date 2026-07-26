import { useEffect, useMemo, useState } from 'react'
import '../dashboard.css'
import './Dashboard.css'
import DepartmentCard from '../components/DepartmentCard'
import StatusFilter from '../components/StatusFilter'
import SearchBox from '../components/SearchBox'
import StatusOverview from '../components/StatusOverview'
import ResetPasswordDialog from '../components/ResetPasswordDialog'
import MeetingNotifications from '../components/MeetingNotifications'
import MonthlyEmployeeTimeline from '../components/MonthlyEmployeeTimeline'
import { formatDateTime, today } from '../utils/status'

const formatHeaderDate = value => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(value)
const formatHeaderTime = value => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(value)
const nonWorkingLabel = day => ({ weekend: 'Weekend', holiday: 'Holiday', special_leave: 'Special leave' }[day.day_type] || 'Non-working day')
const moveDate = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + amount); return value.toISOString().slice(0, 10) }
const moveMonth = (date, amount) => { const value = new Date(`${date}T12:00:00`); value.setMonth(value.getMonth() + amount); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-01` }

export default function Dashboard({ profile, data, onSignOut, goAdmin, goMonthly, goMeeting, goProduction, goUpdate, goCalendar, onDateChange }) {
  const { employees, departments, calendarDay, isWorkingDay, loading, error, date } = data
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [viewMode, setViewMode] = useState('day')
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
      <div className="header-actions-wrap"><div className="top-actions"><span className="user-chip">{profile.full_name}</span><button className="secondary-button" onClick={goUpdate}>My Status</button>{profile.role === 'admin' && <><button className="secondary-button" onClick={goAdmin}>Admin</button><button className="secondary-button" onClick={goCalendar}>Work calendar</button><button className="secondary-button reset-button" onClick={() => setResetPassword(true)}>Reset password</button></>}<button className="text-button" onClick={onSignOut}>Sign out</button><MeetingNotifications employeeId={profile.id} onOpenMyStatus={goUpdate}/></div><time className="header-clock">{formatHeaderDate(now)}<br/><b>{formatHeaderTime(now)}</b></time></div>
    </header>
    <nav className="dashboard-navigation" aria-label="Dashboard pages"><button className="secondary-button" onClick={goMonthly}>Monthly statistics</button><button className="secondary-button" onClick={goMeeting}>Meeting Info</button><button className="production-dashboard-tab" onClick={goProduction}>Block 09-2/09 production</button></nav>
    <section className="toolbar"><div className="dashboard-view-toggle"><button className={viewMode === 'day' ? 'is-active' : ''} onClick={() => { if (viewMode === 'month') onDateChange(today()); setViewMode('day') }}>By day</button><button className={viewMode === 'month' ? 'is-active' : ''} onClick={() => setViewMode('month')}>By month</button></div><div className="dashboard-period-controls"><button className="dashboard-period-button dashboard-previous-period" onClick={() => onDateChange(viewMode === 'month' ? moveMonth(date, -1) : moveDate(date, -1))}>← Previous {viewMode}</button><input className="dashboard-period-input" type={viewMode === 'month' ? 'month' : 'date'} value={viewMode === 'month' ? date.slice(0, 7) : date} onChange={event => onDateChange(viewMode === 'month' ? `${event.target.value}-01` : event.target.value)} /><button className="dashboard-period-button" onClick={() => onDateChange(viewMode === 'month' ? moveMonth(date, 1) : moveDate(date, 1))}>Next {viewMode} →</button></div><div className="dashboard-filter-controls"><SearchBox value={query} onChange={setQuery}/>{viewMode === 'day' ? <StatusFilter value={filter} onChange={setFilter} departmentValue={departmentFilter} onDepartmentChange={setDepartmentFilter} departments={departments}/> : <label className="dashboard-month-department">Department<select value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="all">All departments</option><option value="management">Management Board</option>{departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>}</div></section>
    {error && <p className="notice error">{error}</p>}
    {viewMode === 'month' ? <MonthlyEmployeeTimeline month={date.slice(0, 7)} employees={employees} departments={departments} query={query} departmentFilter={departmentFilter}/> : loading ? <p className="loading">Loading data...</p> : !isWorkingDay ? <>
      <section className="dashboard-empty non-working-dashboard"><span>◌</span><h2>{nonWorkingMessage}</h2></section>
      {nonWorkingLeaders.length > 0 && <section className="leadership-section"><div className="leadership-list"><DepartmentCard department={{ name: 'Management Board' }} employees={nonWorkingLeaders} nonWorking/></div></section>}
      <section className="department-grid">{nonWorkingDepartments.map(department => <DepartmentCard key={department.id} department={department} employees={department.employees} nonWorking/>)}</section>
      {nonWorkingEmployees.length === 0 && <p className="empty">No employees are working or on business trips.</p>}
    </> : <>
      <StatusOverview employees={dashboardEmployees}/>
      {leaders.length > 0 && <section className="leadership-section"><div className="leadership-list"><DepartmentCard department={{ name: 'Management Board' }} employees={leaders}/></div></section>}
      <section className="department-grid">{visibleDepartments.map(department => <DepartmentCard key={department.id} department={department} employees={department.employees}/>)}</section>
      {visible.length === 0 && <div className="dashboard-empty"><span>◌</span><p>No matching employees found.</p></div>}
    </>}
    {resetPassword && <ResetPasswordDialog employees={employees} onClose={() => setResetPassword(false)} />}
  </main>
}
