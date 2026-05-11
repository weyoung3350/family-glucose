const PERIODS = [
  { key: 'fasting', label: '空腹' },
  { key: 'before_breakfast', label: '早餐前' },
  { key: 'after_breakfast', label: '早餐后' },
  { key: 'before_lunch', label: '午餐前' },
  { key: 'after_lunch', label: '午餐后' },
  { key: 'before_dinner', label: '晚餐前' },
  { key: 'after_dinner', label: '晚餐后' },
  { key: 'bedtime', label: '睡前' },
]

const PERIOD_MAP = PERIODS.reduce((acc, item) => {
  acc[item.key] = item.label
  return acc
}, {})

const GRADE_LABELS = { low: '偏低', ideal: '理想', ok: '一般', high: '偏高', vhigh: '过高' }
const GRADE_COLORS = {
  low: '#4DA3FF',
  ideal: '#52C41A',
  ok: '#FFC53D',
  high: '#FA8C16',
  vhigh: '#F5222D',
}
const GRADE_TEXT_COLORS = {
  low: '#FFFFFF',
  ideal: '#FFFFFF',
  ok: '#874D00',
  high: '#FFFFFF',
  vhigh: '#FFFFFF',
}
// 本机调试时把 USE_LOCAL 改 true；上线发布前必须 false
const USE_LOCAL = false
const API_BASE = USE_LOCAL
  ? 'http://localhost:8080/api/v1'
  : 'https://glucose-api.bwton.com/api/v1'
const APP_VERSION = 'v0.1.17'

module.exports = { PERIODS, PERIOD_MAP, GRADE_LABELS, GRADE_COLORS, GRADE_TEXT_COLORS, API_BASE, APP_VERSION }
