import { STATUS, statusLabel, formatDateTime } from '../utils/status'

const shortDate = date => new Intl.DateTimeFormat('vi-VN').format(new Date(`${date}T00:00:00`))

export default function EmployeeBadge({ employee, onClick, editable = false }) {
  const status = STATUS[employee.displayStatus]
  const period = employee.dailyPeriod
  return <button className={`employee-badge ${editable ? 'is-editable' : ''}`} onClick={() => editable && onClick(employee)}>
    <span className="employee-status-dot" style={{ backgroundColor: status.color }} />
    <span className="employee-name">{employee.full_name}</span>
    <span className="employee-tooltip"><b>{employee.full_name}</b><br />Mã nhân viên: {employee.employee_code}<br />Trạng thái: {statusLabel(employee.displayStatus)}{period && <><br />Thời gian: {shortDate(period.start)} - {shortDate(period.end)}</>}{employee.daily?.note && <><br />Ghi chú: {employee.daily.note}</>}{employee.daily?.updated_at && <><br />Cập nhật: {formatDateTime(employee.daily.updated_at)}</>}</span>
  </button>
}
