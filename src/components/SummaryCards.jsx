import { STATUS } from '../utils/status'

export default function SummaryCards({ employees }) {
  const cards = [{ key: 'total', label: 'Total employees', value: employees.length, color: '#263d5a' }, ...Object.entries(STATUS).map(([key, info]) => ({ key, label: info.label, value: employees.filter(employee => employee.displayStatus === key).length, color: info.color }))]
  return <section className="summary-grid">{cards.map(card => <article className="summary-card" key={card.key}><span className="summary-dot" style={{ backgroundColor: card.color }} /><div><small>{card.label}</small><strong>{card.value}</strong></div></article>)}</section>
}
