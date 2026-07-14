import EmployeeBadge from './EmployeeBadge'
import { STATUS } from '../utils/status'

export default function DepartmentCard({ department, employees, onEmployeeClick, editable }) {
  const count = key => employees.filter(employee => employee.displayStatus === key).length
  const accent = ['#2e6fae', '#526f96', '#3c8a73', '#8a6f3a'][[...department.name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 4]
  return <section className="department-card" style={{ borderTopColor: accent }}><header style={{ display: 'flex' }}><div><h2>{department.name}</h2></div><div style={{ fontSize: 22, whiteSpace: 'nowrap' }}><strong>{count('working')}</strong><span style={{ display: 'inline', fontSize: 11, color: '#75859a', fontWeight: 500 }}> / {employees.length} working</span></div></header><div className="mini-summary" aria-label="Department status summary">{Object.entries(STATUS).filter(([key]) => key !== 'meeting').map(([key, item]) => <span key={key} title={`${item.label}: ${count(key)} employees`}><i style={{ background: item.color }} /><b>{count(key)}</b></span>)}</div><div className="employee-list">{employees.length ? employees.map(employee => <EmployeeBadge key={employee.id} employee={employee} onClick={onEmployeeClick} editable={editable} />) : <p className="empty">No matching employees</p>}</div></section>
}
