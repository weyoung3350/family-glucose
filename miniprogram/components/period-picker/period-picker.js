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
      // 父页 setData period='' 是子组件 triggerEvent(complete:false) 的回环，
      // 此时本组件正处于"已选 meal，等待餐前/餐后"中间态，跳过重置避免清空 UI
      if (!v && this.data.currentMeal && !this.data.currentBa && ANCHOR_KEYS.indexOf(this.data.currentMeal) < 0) {
        return
      }
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
        this.triggerEvent('change', { value: meal, complete: true })
      } else {
        this.setData({ currentMeal: meal, currentBa: '', showBeforeAfter: true })
        // 餐次选了但餐前/餐后还没选 → 通知父页面 period 暂时无效，禁止保存
        this.triggerEvent('change', { value: '', complete: false })
      }
    },
    onBaPick(e) {
      const ba = e.currentTarget.dataset.ba
      const value = `${ba}_${this.data.currentMeal}`
      this.setData({ currentBa: ba })
      this.triggerEvent('change', { value, complete: true })
    },
  },
})
