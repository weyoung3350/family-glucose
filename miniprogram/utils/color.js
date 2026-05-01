const { GRADE_COLORS, GRADE_LABELS, GRADE_TEXT_COLORS } = require('./const.js')

function statusOf(record) {
  return record.status
}

function colorOf(level) {
  return GRADE_COLORS[level] || '#86909C'
}

function textColorOf(level) {
  return GRADE_TEXT_COLORS[level] || '#FFFFFF'
}

function labelOf(level) {
  return GRADE_LABELS[level] || ''
}

module.exports = { statusOf, colorOf, textColorOf, labelOf }
