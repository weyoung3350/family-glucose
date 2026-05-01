const { PERIOD_MAP, PERIODS } = require('./const.js')

function periodLabel(key) {
  return PERIOD_MAP[key] || key
}

function shortLabel(key) {
  const map = {
    before_breakfast: '早前',
    after_breakfast: '早后',
    before_lunch: '午前',
    after_lunch: '午后',
    before_dinner: '晚前',
    after_dinner: '晚后',
  }
  return map[key] || PERIOD_MAP[key] || key
}

module.exports = { periods: PERIODS, periodLabel, shortLabel }
