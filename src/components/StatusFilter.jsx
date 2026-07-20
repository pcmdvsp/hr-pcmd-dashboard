import { STATUS } from '../utils/status'
import './StatusFilter.css'

export default function StatusFilter({ value, onChange, departmentValue, onDepartmentChange, departments }) {
  const statusFilters = Object.entries(STATUS).filter(([key]) => key !== 'meeting').flatMap(([key, item]) => key === 'working'
    ? [['all', { label: 'All' }], [key, item]]
    : [[key, item]])

  return <div className="status-filter">
    <select className="department-filter" value={departmentValue} onChange={event => onDepartmentChange(event.target.value)} aria-label="Filter by department">
      <option value="all">All departments</option>
      <option value="leadership">Management Board</option>
      {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
    </select>
    <div className="status-filter-options" aria-label="Filter by status">
      {statusFilters.map(([key, item]) => <button key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{item.label}</button>)}
    </div>
  </div>
}
