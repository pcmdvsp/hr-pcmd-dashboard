import { StrictMode, useEffect, useState } from 'react'
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
import MeetingInfoPage from './pages/MeetingInfoPage'
import RoomReservationAlert from './components/RoomReservationAlert'
import SuccessAlert from './components/SuccessAlert'

function App() {
  const { session, profile, refreshProfile } = useAuth(); const location = useLocation(); const navigate = useNavigate(); const selectedDate = new URLSearchParams(location.search).get('date') || today(); const data = useDashboard(selectedDate, session?.user?.id); const [page, setPage] = useState('dashboard')
  useEffect(() => { const setEnglishRequiredMessage = event => { if (event.target.validity?.valueMissing) event.target.setCustomValidity('Please fill out this field.') }; const clearMessage = event => event.target.setCustomValidity?.(''); document.addEventListener('invalid', setEnglishRequiredMessage, true); document.addEventListener('input', clearMessage, true); return () => { document.removeEventListener('invalid', setEnglishRequiredMessage, true); document.removeEventListener('input', clearMessage, true) } }, [])
  if (!isSupabaseConfigured) return <main className="auth-layout"><div className="auth-card"><h1>Supabase configuration is missing</h1><p>Copy <code>.env.example</code> to <code>.env.local</code>, then enter your Supabase project URL and anon key.</p></div></main>
  if (session === undefined || profile === undefined) return <main className="auth-layout">Initializing...</main>
  if (!session) return <LoginPage/>
  if (!profile) return <main className="auth-layout"><div className="auth-card"><h1>Profile not found</h1><p>You are signed in, but this account does not have a profiles record. Please contact an administrator.</p></div></main>
  if (profile.must_change_password) return <ChangePasswordPage refreshProfile={refreshProfile}/>
  const returnToDashboard = () => { data.reload(); setPage('dashboard'); navigate('/') }
  if (location.pathname === '/update') return <UpdateStatusPage profile={profile} goBack={returnToDashboard} />
  const signout = () => supabase.auth.signOut()
  if (page === 'monthly') return <MonthlyStatsPage profile={profile} goBack={returnToDashboard} />
  if (page === 'update') return <UpdateStatusPage profile={profile} goBack={returnToDashboard} />
  if (page === 'meeting') return <MeetingInfoPage profile={profile} goBack={returnToDashboard} />
  if (page === 'calendar' && profile.role === 'admin') return <WorkCalendarPage goBack={returnToDashboard} />
  return page === 'admin' && profile.role === 'admin' ? <AdminPage data={data} goBack={returnToDashboard}/> : <Dashboard profile={profile} data={data} onSignOut={signout} goAdmin={() => setPage('admin')} goMonthly={() => setPage('monthly')} goMeeting={() => setPage('meeting')} goUpdate={() => setPage('update')} goCalendar={() => setPage('calendar')} onDateChange={date => navigate(`/?date=${date}`)}/>
}

createRoot(document.getElementById('root')).render(<StrictMode><RoomReservationAlert/><SuccessAlert/><HashRouter><App/></HashRouter></StrictMode>)
