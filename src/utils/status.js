export const STATUS = {
  working: { label: 'Đi làm', color: '#2ecc71', className: 'working' },
  business_trip: { label: 'Đi công tác', color: '#f1c40f', className: 'business-trip' },
  leave: { label: 'Nghỉ phép', color: '#3498db', className: 'leave' },
  sick: { label: 'Nghỉ ốm', color: '#e74c3c', className: 'sick' },
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
export const statusLabel = (status) => STATUS[status]?.label ?? STATUS.working.label
export const formatDate = (date) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'full' }).format(new Date(`${date}T00:00:00`))
export const formatDateTime = (date) => date ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date)) : 'Chưa cập nhật'
