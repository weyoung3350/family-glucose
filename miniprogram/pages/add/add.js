const { api } = require('../../utils/api.js')
const { periods, periodLabel } = require('../../utils/period.js')
const { roundTo5Min, formatDate, toLocalIso } = require('../../utils/time.js')
const offline = require('../../utils/offline.js')
const errors = require('../../utils/errors.js')

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']

Page({
  data: {
    mode: 'manual',
    id: null,
    // manual
    value: '',
    period: 'fasting',
    periodIncomplete: false,
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
    recording: false,
    recordHint: '',
    voiceDisabled: false,
    cancelling: false,
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
      // 本地 ISO（无 Z 后缀），与后端 now_cn() 统一按北京时间存
      measuredAt: toLocalIso(d),
      timeText: formatDate(d),
      timeValue: [d.getHours(), Math.floor(d.getMinutes() / 5)],
    })
  },
  onValueInput(event) { this.setData({ value: event.detail.value }) },
  onNoteInput(event) { this.setData({ note: event.detail.value }) },
  onPeriodChange(event) {
    this.setData({
      period: event.detail.value,
      periodIncomplete: event.detail.complete === false,
    })
  },
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
    if (this.data.periodIncomplete || !this.data.period) {
      wx.showToast({ title: '请选择餐前或餐后', icon: 'none' })
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
      errors.toast(err, '保存失败')
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
      this.setData({ error: errors.describe(err) })
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

  // ---------- 语音录入 ----------
  ensureRecorder() {
    if (this.recorderManager) return
    const rm = wx.getRecorderManager()
    rm.onStart(() => {
      this.setData({ recording: true, error: '', recordHint: '正在录音…松开识别' })
    })
    rm.onStop((res) => {
      const wasCancelling = this.data.cancelling
      this.setData({ recording: false, recordHint: '', cancelling: false })
      if (wasCancelling) {
        wx.showToast({ title: '已取消', icon: 'none', duration: 800 })
        return
      }
      if (!res || !res.tempFilePath) return
      if (res.duration < 800) {
        this.setData({ error: '录音太短，至少说一句话' })
        return
      }
      this.uploadVoice(res.tempFilePath)
    })
    rm.onError((err) => {
      const errMsg = (err && err.errMsg) || ''
      let friendly = '录音失败，请重试'
      if (errMsg.indexOf('scope is not declared') >= 0 || errMsg.indexOf('privacy agreement') >= 0) {
        friendly = '语音功能开通中，本次请用文字输入'
        this.setData({ voiceDisabled: true })
      } else if (errMsg.indexOf('auth deny') >= 0 || errMsg.indexOf('authorize') >= 0) {
        friendly = '麦克风权限被拒绝，请在系统设置开启微信麦克风权限'
      } else if (errMsg.indexOf('is recording') >= 0 || errMsg.indexOf('paused') >= 0) {
        // 残留状态，强制 stop 一次清掉，下次按住能重来
        try { rm.stop() } catch (e) { /* noop */ }
        friendly = '录音器忙碌，请重新长按'
      } else if (errMsg) {
        friendly = '录音失败：' + errMsg
      }
      this.setData({ recording: false, recordHint: '', error: friendly })
    })
    rm.onInterruptionBegin(() => {
      try { rm.stop() } catch (e) { /* noop */ }
      this.setData({ recording: false, recordHint: '' })
    })
    this.recorderManager = rm
  },
  onVoiceTouchStart(e) {
    this.ensureRecorder()
    // 防御：如果 recorder 仍在 running 状态，先强制 stop 清状态再 start
    if (this.data.recording) {
      try { this.recorderManager.stop() } catch (err) { /* noop */ }
      this.setData({ recording: false, recordHint: '' })
    }
    this.setData({ error: '', cancelling: false })
    // 记录起始 Y，用于检测上滑取消
    const touch = e && e.touches && e.touches[0]
    this._touchStartY = touch ? touch.clientY : 0
    setTimeout(() => {
      try {
        this.recorderManager.start({
          duration: 60000,
          sampleRate: 16000,
          numberOfChannels: 1,
          encodeBitRate: 48000,
          format: 'mp3',
        })
      } catch (err) {
        this.setData({ error: '录音启动失败，请重试' })
      }
    }, 80)
  },
  onVoiceTouchMove(e) {
    if (!this.data.recording) return
    const touch = e && e.touches && e.touches[0]
    if (!touch) return
    const deltaY = this._touchStartY - touch.clientY  // 上滑为正
    const shouldCancel = deltaY > 60  // 上滑超 60px = 取消
    if (shouldCancel !== this.data.cancelling) {
      this.setData({ cancelling: shouldCancel })
    }
  },
  onVoiceTouchEnd() {
    if (this.data.recording && this.recorderManager) {
      try { this.recorderManager.stop() } catch (err) { /* noop */ }
    }
  },
  onVoiceTouchCancel() {
    // 系统打断（来电、滑出可视区）等，按取消处理
    if (this.data.recording && this.recorderManager) {
      this.setData({ cancelling: true })
      try { this.recorderManager.stop() } catch (err) { /* noop */ }
    }
  },
  async uploadVoice(filePath) {
    this.setData({ parsing: true, recordHint: '识别中…', error: '' })
    try {
      const res = await api.parseVoice(filePath)
      const parsed = res.parsed || {}
      parsed.periodLabel = parsed.period ? periodLabel(parsed.period) : ''
      parsed.timeText = parsed.measured_at ? formatDate(parsed.measured_at, 'YYYY-MM-DD HH:mm') : ''
      this.setData({
        text: res.raw_text || '',
        parsed,
        missing: res.missing || [],
        missingText: this.buildMissingText(res.missing || []),
        canSave: Boolean(parsed.value && parsed.period),
      })
    } catch (err) {
      this.setData({ error: errors.describe(err) })
    } finally {
      this.setData({ parsing: false, recordHint: '' })
    }
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
    const complete = event.detail.complete !== false
    this.setData({
      'parsed.period': period,
      'parsed.periodLabel': period ? periodLabel(period) : '请选择餐前或餐后',
      'parsed.period_inferred': false,
      missing: complete ? this.data.missing.filter((item) => item !== 'period') : this.data.missing,
      missingText: this.buildMissingText(complete ? this.data.missing.filter((item) => item !== 'period') : this.data.missing),
      canSave: Boolean(this.data.parsed && this.data.parsed.value && period && complete),
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
            'parsed.measured_at': toLocalIso(now),
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
      errors.toast(err, '保存失败')
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
