const { api } = require('../../utils/api.js')
const { periods, periodLabel } = require('../../utils/period.js')
const { roundTo5Min, formatDate } = require('../../utils/time.js')
const offline = require('../../utils/offline.js')

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

Page({
  data: {
    mode: 'manual',
    id: null,
    // manual
    value: '',
    period: 'fasting',
    note: '',
    measuredAt: '',
    timeText: '',
    timeRange: [HOURS, MINUTES],
    timeValue: [0, 0],
    periods,
    // ai
    text: '',
    parsed: null,
    missing: [],
    missingText: '',
    canSave: false,
    error: '',
    parsing: false,
  },
  onLoad(query) {
    const now = roundTo5Min(new Date())
    this.setMeasuredAt(now)
    if (query.mode === 'ai') {
      this.setData({ mode: 'ai' })
      wx.setNavigationBarTitle({ title: '一句话快记' })
    }
    if (query.id) {
      this.setData({ id: Number(query.id), mode: 'manual' })
      this.loadRecord(query.id)
    }
  },
  switchMode(event) {
    const mode = event.currentTarget.dataset.mode
    if (mode === this.data.mode) return
    if (this.data.id) return
    this.setData({ mode })
    wx.setNavigationBarTitle({ title: mode === 'ai' ? '一句话快记' : '记一次血糖' })
  },

  // ---------- manual mode ----------
  async loadRecord(id) {
    const record = await api.getRecord(id)
    this.setData({ value: String(record.value), period: record.period, note: record.note || '' })
    this.setMeasuredAt(new Date(record.measured_at))
  },
  setMeasuredAt(date) {
    const d = roundTo5Min(date)
    this.setData({
      measuredAt: d.toISOString(),
      timeText: formatDate(d),
      timeValue: [d.getHours(), Math.floor(d.getMinutes() / 5)],
    })
  },
  onValueInput(event) { this.setData({ value: event.detail.value }) },
  onNoteInput(event) { this.setData({ note: event.detail.value }) },
  onPeriodChange(event) { this.setData({ period: event.detail.value }) },
  onTimeChange(event) {
    const [hourIdx, minuteIdx] = event.detail.value
    const d = new Date(this.data.measuredAt)
    d.setHours(Number(HOURS[hourIdx]), Number(MINUTES[minuteIdx]), 0, 0)
    this.setMeasuredAt(d)
  },
  async onSave() {
    const value = Number(this.data.value)
    if (!value || value <= 0 || value >= 50) {
      wx.showToast({ title: '血糖值需在 0-50 之间', icon: 'none' })
      return
    }
    if (value >= 25) {
      const confirmed = await new Promise((resolve) => {
        wx.showModal({
          title: '请确认',
          content: `血糖值 ${value} mmol/L 较高，是否确认录入？`,
          success: (res) => resolve(res.confirm),
          fail: () => resolve(false),
        })
      })
      if (!confirmed) return
    }
    const payload = {
      value: Math.round(value * 10) / 10,
      period: this.data.period,
      measured_at: this.data.measuredAt,
      note: this.data.note,
      source: 'manual',
    }
    try {
      let saved
      if (this.data.id) saved = await api.updateRecord(this.data.id, payload)
      else saved = await api.createRecord(payload)
      const newId = saved && saved.id ? saved.id : this.data.id
      if (newId && !this.data.id) wx.setStorageSync('pending_highlight_id', newId)
      wx.showToast({ title: '保存成功', duration: 1200 })
      setTimeout(() => wx.navigateBack(), 1200)
    } catch (err) {
      if (!this.data.id && (err.code === 'ERR_NETWORK' || err.code === 'ERR_TIMEOUT' || err.code === 'ERR_HTTP')) {
        offline.enqueue(payload)
        wx.showToast({ title: '已暂存，连网后自动同步', icon: 'success', duration: 1500 })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },

  // ---------- ai mode ----------
  onTextInput(event) {
    this.setData({ text: event.detail.value, error: '', parsed: null, canSave: false, missingText: '' })
  },
  async parseText() {
    const text = this.data.text.trim()
    if (!text) return
    this.setData({ parsing: true })
    try {
      const res = await api.parseRecord(text)
      const parsed = res.parsed
      parsed.periodLabel = parsed.period ? periodLabel(parsed.period) : ''
      parsed.timeText = parsed.measured_at ? formatDate(parsed.measured_at, 'YYYY-MM-DD HH:mm') : ''
      this.setData({
        parsed,
        missing: res.missing,
        missingText: this.buildMissingText(res.missing),
        canSave: Boolean(parsed.value && parsed.period),
        error: '',
      })
    } catch (err) {
      let msg = '识别失败，请稍后再试'
      if (err.code === 'ERR_NETWORK' || err.code === 'ERR_TIMEOUT') msg = err.message
      else if (err.code === 'ERR_AI_PARSE') msg = '内容格式无法识别，请换种说法或手动录入'
      this.setData({ error: msg })
    } finally {
      this.setData({ parsing: false })
    }
  },
  onClear() {
    this.setData({ text: '', parsed: null, missing: [], missingText: '', canSave: false, error: '' })
  },
  onRecognize() {
    if (!this.data.text.trim() || this.data.parsing) return
    this.parseText()
  },
  onValueEdit() {
    wx.showModal({
      title: '修改血糖值',
      editable: true,
      placeholderText: '例如 7.2',
      success: (res) => {
        if (res.confirm) this.setData({ 'parsed.value': Number(res.content), canSave: Boolean(Number(res.content) && this.data.parsed.period) })
      },
    })
  },
  onAiPeriodChange(event) {
    const period = event.detail.value
    this.setData({
      'parsed.period': period,
      'parsed.periodLabel': periodLabel(period),
      'parsed.period_inferred': false,
      missing: this.data.missing.filter((item) => item !== 'period'),
      missingText: this.buildMissingText(this.data.missing.filter((item) => item !== 'period')),
      canSave: Boolean(this.data.parsed && this.data.parsed.value),
    })
  },
  onNoteEdit() {
    wx.showModal({
      title: '修改备注',
      editable: true,
      placeholderText: '备注',
      success: (res) => {
        if (res.confirm) this.setData({ 'parsed.note': res.content })
      },
    })
  },
  onTimeEdit() {
    wx.showActionSheet({
      itemList: ['保留当前', '改为现在'],
      success: (res) => {
        if (res.tapIndex === 1) {
          const now = new Date()
          this.setData({
            'parsed.measured_at': now.toISOString(),
            'parsed.timeText': formatDate(now, 'YYYY-MM-DD HH:mm'),
            'parsed.measured_at_inferred': false,
          })
        }
      },
    })
  },
  async onAiSave() {
    const parsed = this.data.parsed
    if (!parsed || !parsed.value || !parsed.period) return
    const payload = {
      value: parsed.value,
      period: parsed.period,
      measured_at: parsed.measured_at,
      note: parsed.note,
      source: 'ai',
    }
    try {
      const saved = await api.createRecord(payload)
      if (saved && saved.id) wx.setStorageSync('pending_highlight_id', saved.id)
      wx.showToast({ title: '保存成功', duration: 1200 })
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1200)
    } catch (err) {
      if (err.code === 'ERR_NETWORK' || err.code === 'ERR_TIMEOUT' || err.code === 'ERR_HTTP') {
        offline.enqueue(payload)
        wx.showToast({ title: '已暂存，连网后自动同步', icon: 'success', duration: 1500 })
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 1500)
        return
      }
      wx.showToast({ title: err.message || '保存失败', icon: 'none' })
    }
  },
  buildMissingText(missing) {
    const labels = []
    if (missing.indexOf('value') >= 0) labels.push('血糖值')
    if (missing.indexOf('period') >= 0) labels.push('时段')
    if (missing.indexOf('measured_at') >= 0) labels.push('时间')
    if (labels.length === 0) return ''
    return `还需要补充：${labels.join('、')}`
  },
  periodLabel,
})
