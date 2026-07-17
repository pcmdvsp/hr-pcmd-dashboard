import EmployeeBadge from './EmployeeBadge'
import StatusIcon from './StatusIcon'
import { STATUS } from '../utils/status'

const statusOrder = ['sick', 'leave', 'business_trip', 'working']

export default function DepartmentCard({ department, employees, onEmployeeClick, editable, nonWorking = false }) {
  const count = key => employees.filter(employee => employee.displayStatus === key).length
  const accent = ['#2e6fae', '#526f96', '#3c8a73', '#8a6f3a'][[...department.name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4]
  const displayedCount = nonWorking ? count('working') + count('business_trip') : count('working')
  const countLabel = nonWorking ? 'working / business trip' : 'working'
  return <section className="department-card" style={{ borderTopColor: accent }}><header style={{ display: 'flex' }}><div><h2>{department.name}</h2></div><div style={{ fontSize: 22, whiteSpace: 'nowrap' }}><strong>{displayedCount}</strong><span style={{ display: 'inline', fontSize: 11, color: '#75859a', fontWeight: 500 }}> / {employees.length} {countLabel}</span></div></header>{employees.length ? <div className="status-groups">{statusOrder.map(key => { const groupEmployees = employees.filter(employee => employee.displayStatus === key); const item = STATUS[key]; return groupEmployees.length ? <section className="status-group" style={{ '--status-color': item.color }} key={key}><div className="status-group-row"><span className="status-group-icon" title={item.label} aria-label={item.label}><StatusIcon status={key}/></span><div className="employee-list">{groupEmployees.map(employee => <EmployeeBadge key={employee.id} employee={employee} onClick={onEmployeeClick} editable={editable} />)}</div></div></section> : null })}</div> : <p className="empty">No matching employees</p>}</section>
}
