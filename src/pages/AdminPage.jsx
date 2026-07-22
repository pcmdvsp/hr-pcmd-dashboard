import { useState } from 'react'
import DepartmentCard from '../components/DepartmentCard'
import StatusForm from '../components/StatusForm'
import SearchBox from '../components/SearchBox'

export default function AdminPage({ data, goBack }) {
  const { employees, departments, date, reload } = data; const [query, setQuery] = useState(''); const [edit, setEdit] = useState(null); const shown = employees.filter(employee => `${employee.full_name} ${employee.employee_code}`.toLowerCase().includes(query.toLowerCase()))
  return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">SYSTEM ADMINISTRATION</p><h1>Employees & status</h1></div><button className="secondary-button" onClick={goBack}>← Back to dashboard</button></header><section className="admin-panel"><SearchBox value={query} onChange={setQuery}/><p>Click an employee to update their status. Adding or editing profiles and resetting passwords must be done through the Supabase Dashboard or a secured Edge Function.</p><div className="department-grid">{departments.map(department => <DepartmentCard key={department.id} department={department} employees={shown.filter(employee => employee.department_id === department.id)} editable onEmployeeClick={setEdit}/>)}</div></section>{edit && <div className="modal-backdrop"><div className="modal"><StatusForm employee={edit} initialDate={date} canEditHistory onSaved={reload} onClose={() => setEdit(null)}/></div></div>}</main>
}
