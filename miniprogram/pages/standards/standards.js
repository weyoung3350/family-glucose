const { api } = require('../../utils/api.js')

Page({
  data: { standards: {}, isCreator: false },
  onLoad() { this.loadStandards() },
  async loadStandards() {
    const app = getApp()
    const standards = await api.getStandards()
    this.setData({ standards, isCreator: app.globalData.family && app.globalData.family.role_of_me === 'creator' })
  },
  editValue(event) {
    if (!this.data.isCreator) return
    const key = event.currentTarget.dataset.key
    wx.showModal({
      title: '修改数值',
      editable: true,
      placeholderText: String(this.data.standards[key]),
      success: (res) => {
        if (!res.confirm) return
        const raw = (res.content || '').trim()
        const num = Number(raw)
        if (!raw || Number.isNaN(num) || num <= 0 || num >= 50) {
          wx.showToast({ title: '请输入 0-50 之间的数字', icon: 'none' })
          return
        }
        this.setData({ [`standards.${key}`]: Math.round(num * 10) / 10 })
      },
    })
  },
  valid() {
    const s = this.data.standards
    return s.critical_low < s.fasting_low && s.fasting_low < s.fasting_high && s.fasting_high < s.critical_high &&
      s.critical_low < s.postprandial_low && s.postprandial_low < s.postprandial_high && s.postprandial_high < s.critical_high
  },
  async onSave() {
    if (!this.valid()) {
      wx.showToast({ title: '上下限不正确，请检查', icon: 'none' })
      return
    }
    await api.updateStandards(this.data.standards)
    wx.showToast({ title: '保存成功' })
  },
})
