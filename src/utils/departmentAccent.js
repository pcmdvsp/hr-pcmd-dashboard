const departmentAccents = ['#2563a6', '#0f766e', '#c77d1a', '#8b5ca7', '#bd4b71', '#2f855a', '#b85c38', '#4d6f9d', '#9a6a18', '#3f7f8f', '#7c5d9d', '#aa4f4f']

const namedDepartmentAccents = {
  'management board': '#6b5a93',
  'block 09-2/09': '#087f8c',
  'block 09-2/10': '#d97706',
  'block 01/17 & 02/17': '#2f855a',
  'block 16-1/15': '#b45309',
  'block 09-3/12': '#b83280',
}

export const departmentAccent = (departmentName, sortOrder) => {
  const name = String(departmentName || '').trim()
  if (namedDepartmentAccents[name.toLowerCase()]) return namedDepartmentAccents[name.toLowerCase()]
  const nameHash = [...name].reduce((sum, character) => (sum * 31 + character.charCodeAt(0)) >>> 0, 7)
  const accentIndex = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : nameHash
  return departmentAccents[Math.abs(accentIndex) % departmentAccents.length]
}
