import { useMemo, useState } from 'react'
import { STATUS } from '../utils/status'

const polar = (angle, radius = 80) => {
  const radians = ((angle - 90) * Math.PI) / 180
  return { x: 100 + radius * Math.cos(radians), y: 100 + radius * Math.sin(radians) }
}

const arcPath = (start, end) => {
  if (end - start >= 359.99) return 'M 100 20 A 80 80 0 1 1 99.99 20 Z'
  const startPoint = polar(start)
  const endPoint = polar(end)
  return `M 100 100 L ${startPoint.x} ${startPoint.y} A 80 80 0 ${end - start > 180 ? 1 : 0} 1 ${endPoint.x} ${endPoint.y} Z`
}

export default function StatusOverview({ employees }) {
  const [hovered, setHovered] = useState(null)
  const { total, counts, slices } = useMemo(() => {
    const totalEmployees = employees.length
    const statusCounts = Object.fromEntries(Object.keys(STATUS).map(key => [key, employees.filter(employee => employee.displayStatus === key).length]))
    let cursor = 0
    const chartSlices = Object.entries(STATUS).filter(([key]) => statusCounts[key] > 0).map(([key, item]) => {
      const next = cursor + (statusCounts[key] / totalEmployees) * 360
      const slice = { key, ...item, count: statusCounts[key], start: cursor, end: next, middle: (cursor + next) / 2 }
      cursor = next
      return slice
    })
    return { total: totalEmployees, counts: statusCounts, slices: chartSlices }
  }, [employees])
  const active = slices.find(slice => slice.key === hovered)

  return <section className="status-overview" aria-label="Tổng quan trạng thái nhân sự">
    <div className="status-pie-wrapper">{active && <div className="pie-tooltip" aria-live="polite">{`${active.label}: ${active.count}`}</div>}<svg className="status-pie" viewBox="0 0 200 200" role="img" aria-label="Biểu đồ tròn trạng thái nhân sự">{slices.map(slice => { const offset = hovered === slice.key ? polar(slice.middle, 6) : { x: 100, y: 100 }; return <path key={slice.key} className={`pie-slice ${hovered === slice.key ? 'is-active' : ''}`} d={arcPath(slice.start, slice.end)} fill={slice.color} transform={`translate(${offset.x - 100} ${offset.y - 100})`} onMouseEnter={() => setHovered(slice.key)} onMouseLeave={() => setHovered(null)} onFocus={() => setHovered(slice.key)} onBlur={() => setHovered(null)} tabIndex="0"><title>{`${slice.label}: ${slice.count}`}</title></path> })}<circle className="status-pie-center" cx="100" cy="100" r="52" pointerEvents="none" /><text className="status-pie-number" x="100" y="96" textAnchor="middle">{total}</text><text className="status-pie-caption" x="100" y="116" textAnchor="middle">nhân sự</text></svg></div>
    <div className="global-legend"><div><p className="eyebrow">TỔNG QUAN TOÀN BAN</p><h2>Phân bổ trạng thái hôm nay</h2></div><div className="global-legend-items">{Object.entries(STATUS).map(([key, item]) => <span key={key}><i style={{ backgroundColor: item.color }} />{item.label}<b>{counts[key]}</b></span>)}</div></div>
  </section>
}
