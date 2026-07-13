import { STATUS } from '../utils/status'
import './StatusFilter.css'

export default function StatusFilter({ value, onChange, departmentValue, onDepartmentChange, departments }) {
  const statusFilters = Object.entries(STATUS).flatMap(([key, item]) => key === 'working'
    ? [['all', { label: 'Tất cả' }], [key, item]]
    : [[key, item]])

  return <div className="status-filter">
    <select
      className="department-filter"
      value={departmentValue}
      onChange={event => onDepartmentChange(event.target.value)}
      aria-label="Lọc theo phòng ban"
    >
      <option value="all">Tất cả phòng ban</option>
      <option value="leadership">Ban lãnh đạo</option>
      {departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}
    </select>
    {statusFilters.map(([key, item]) => <button key={key} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{item.label}</button>)}
  </div>
}
