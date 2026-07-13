export const STATUS = {
  working: { label: 'Working', color: '#2ecc71', className: 'working' },
  business_trip: { label: 'Business trip', color: '#f1c40f', className: 'business-trip' },
  leave: { label: 'Annual leave', color: '#3498db', className: 'leave' },
  sick: { label: 'Sick leave', color: '#e74c3c', className: 'sick' },
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())
export const statusLabel = status => STATUS[status]?.label ?? STATUS.working.label
export const formatDate = date => new Intl.DateTimeFormat('en-GB', { dateStyle: 'full' }).format(new Date(`${date}T00:00:00`))
export const formatDateTime = date => date ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(date)) : 'Not updated yet'
