const MEALS = [
  { key: 'fasting', label: '空腹' },
  { key: 'breakfast', label: '早餐' },
  { key: 'lunch', label: '午餐' },
  { key: 'dinner', label: '晚餐' },
  { key: 'bedtime', label: '睡前' },
]

const ANCHOR_KEYS = ['fasting', 'bedtime']

function splitValue(v) {
  if (!v) return { meal: '', ba: '' }
  if (ANCHOR_KEYS.indexOf(v) >= 0) return { meal: v, ba: '' }
  if (v.indexOf('before_') === 0) return { meal: v.slice('before_'.length), ba: 'before' }
  if (v.indexOf('after_') === 0) return { meal: v.slice('after_'.length), ba: 'after' }
  return { meal: '', ba: '' }
}

Component({
  properties: {
    value: String,
  },
  data: {
    meals: MEALS,
    currentMeal: '',
    currentBa: '',
    showBeforeAfter: false,
  },
  observers: {
    value(v) {
      const { meal, ba } = splitValue(v)
      this.setData({
        currentMeal: meal,
        currentBa: ba,
        showBeforeAfter: Boolean(meal) && ANCHOR_KEYS.indexOf(meal) < 0,
      })
    },
  },
  methods: {
    onMealPick(e) {
      const meal = e.currentTarget.dataset.key
      if (ANCHOR_KEYS.indexOf(meal) >= 0) {
        this.setData({ currentMeal: meal, currentBa: '', showBeforeAfter: false })
        this.triggerEvent('change', { value: meal })
      } else {
        this.setData({ currentMeal: meal, currentBa: '', showBeforeAfter: true })
      }
    },
    onBaPick(e) {
      const ba = e.currentTarget.dataset.ba
      const value = `${ba}_${this.data.currentMeal}`
      this.setData({ currentBa: ba })
      this.triggerEvent('change', { value })
    },
  },
})
