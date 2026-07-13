import EmployeeBadge from './EmployeeBadge'
import { STATUS } from '../utils/status'

export default function DepartmentCard({ department, employees, onEmployeeClick, editable }) {
  const count = key => employees.filter(employee => employee.displayStatus === key).length
  return <section className="department-card"><header style={{ display: 'flex' }}><div><h2>{department.name}</h2></div><b>{count('working')}<span> / {employees.length} working</span></b></header><div className="mini-summary" aria-label="Department status summary">{Object.entries(STATUS).map(([key, item]) => <span key={key} title={`${item.label}: ${count(key)} employees`}><i style={{ background: item.color }} /><b>{count(key)}</b></span>)}</div><div className="employee-list">{employees.length ? employees.map(employee => <EmployeeBadge key={employee.id} employee={employee} onClick={onEmployeeClick} editable={editable} />) : <p className="empty">No matching employees</p>}</div></section>
}
