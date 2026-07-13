import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, useLocation, useNavigate } from 'react-router-dom'
import './styles.css'
import './monthly.css'
import { supabase, isSupabaseConfigured } from './lib/supabaseClient'
import { useAuth } from './hooks/useAuth'
import { useDashboard } from './hooks/useDashboard'
import { today } from './utils/status'
import LoginPage from './pages/LoginPage'
import ChangePasswordPage from './pages/ChangePasswordPage'
import Dashboard from './pages/Dashboard'
import UpdateStatusPage from './pages/UpdateStatusPage'
import AdminPage from './pages/AdminPage'
import MonthlyStatsPage from './pages/MonthlyStatsPage'
import WorkCalendarPage from './pages/WorkCalendarPage'

function App() {
  const { session, profile, refreshProfile } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const selectedDate = new URLSearchParams(location.search).get('date') || today()
  const data = useDashboard(selectedDate)
  const [page, setPage] = useState('dashboard')
  if (!isSupabaseConfigured) return <main className="auth-layout"><div className="auth-card"><h1>Thiếu cấu hình Supabase</h1><p>Sao chép <code>.env.example</code> thành <code>.env.local</code> và nhập URL, anon key của dự án Supabase.</p></div></main>
  if (session === undefined || profile === undefined) return <main className="auth-layout">Đang khởi tạo...</main>
  if (!session) return <LoginPage/>
  if (!profile) return <main className="auth-layout"><div className="auth-card"><h1>Không tìm thấy hồ sơ</h1><p>Tài khoản đã đăng nhập nhưng chưa có bản ghi profiles. Hãy liên hệ quản trị viên.</p></div></main>
  if (profile.must_change_password) return <ChangePasswordPage refreshProfile={refreshProfile}/>
  if (location.pathname === '/update') return <UpdateStatusPage profile={profile}/>
  const signout = () => supabase.auth.signOut()
  if (page === 'monthly') return <MonthlyStatsPage profile={profile} goBack={() => setPage('dashboard')} />
  if (page === 'calendar' && profile.role === 'admin') return <WorkCalendarPage goBack={() => setPage('dashboard')} />
  return page === 'admin' && profile.role === 'admin' ? <AdminPage data={data} goBack={() => setPage('dashboard')}/> : <Dashboard profile={profile} data={data} onSignOut={signout} goAdmin={() => setPage('admin')} goMonthly={() => setPage('monthly')} goCalendar={() => setPage('calendar')} onDateChange={date => navigate(`/?date=${date}`)}/>
}

createRoot(document.getElementById('root')).render(<StrictMode><HashRouter><App/></HashRouter></StrictMode>)
