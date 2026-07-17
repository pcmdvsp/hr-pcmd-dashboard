import { BriefcaseBusiness, Palmtree, PlaneTakeoff, Thermometer } from 'lucide-react'

export default function StatusIcon({ status, size = 18 }) {
  const props = { size, strokeWidth: 2.2, 'aria-hidden': true }
  if (status === 'sick') return <Thermometer {...props}/>
  if (status === 'leave') return <Palmtree {...props}/>
  if (status === 'business_trip') return <PlaneTakeoff {...props}/>
  return <BriefcaseBusiness {...props}/>
}
