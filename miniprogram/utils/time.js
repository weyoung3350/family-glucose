function pad(n) {
  return String(n).padStart(2, '0')
}

function roundTo5Min(date) {
  const d = new Date(date.getTime())
  const minute = d.getMinutes()
  let newMinute = Math.floor(minute / 5) * 5
  if (minute % 5 >= 3) newMinute += 5
  if (newMinute === 60) {
    d.setHours(d.getHours() + 1)
    newMinute = 0
  }
  d.setMinutes(newMinute, 0, 0)
  return d
}

function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
  const d = new Date(date)
  return fmt
    .replace('YYYY', d.getFullYear())
    .replace('MM', pad(d.getMonth() + 1))
    .replace('DD', pad(d.getDate()))
    .replace('HH', pad(d.getHours()))
    .replace('mm', pad(d.getMinutes()))
}

function relative(date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(date)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff < 7) return `${diff} 天前`
  return formatDate(d, 'YYYY-MM-DD')
}

function timeLabel(date) {
  return formatDate(new Date(date), 'HH:mm')
}

function dateOnly(date) {
  return formatDate(new Date(date), 'YYYY-MM-DD')
}

function daysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days + 1)
  return dateOnly(d)
}

module.exports = { roundTo5Min, formatDate, relative, timeLabel, dateOnly, daysAgo }
