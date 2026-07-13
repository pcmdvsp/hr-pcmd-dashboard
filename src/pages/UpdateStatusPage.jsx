import StatusForm from '../components/StatusForm'

export default function UpdateStatusPage({ profile }) {
  return <main className="auth-layout"><section className="auth-card update-card"><header><p className="eyebrow">TRẠNG THÁI LÀM VIỆC</p><h1>Cập nhật</h1><p>Chọn trạng thái và khoảng thời gian áp dụng.</p></header><StatusForm employee={profile} /></section></main>
}
