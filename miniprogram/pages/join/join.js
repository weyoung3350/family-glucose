const { api } = require('../../utils/api.js')

Page({
  data: {
    code: '',
    showCreate: false,
    familyName: '',
    createError: '',
    loading: false,
  },
  onLoad(query) {
    if (query.code) this.setData({ code: query.code.toUpperCase().slice(0, 6) })
  },
  onCodeInput(event) {
    this.setData({ code: String(event.detail.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) })
  },
  onNameInput(event) {
    this.setData({ familyName: event.detail.value, createError: '' })
  },
  async onJoin() {
    if (this.data.code.length !== 6) {
      wx.showToast({ title: '请输入 6 位邀请码', icon: 'none' })
      return
    }
    await this.submitFamily(() => api.joinFamily(this.data.code))
  },
  showCreateDialog() {
    this.setData({ showCreate: true, familyName: '', createError: '' })
  },
  hideCreateDialog() {
    this.setData({ showCreate: false })
  },
  async onCreate() {
    const name = this.data.familyName.trim()
    if (!name) {
      this.setData({ createError: '请输入家庭名' })
      return
    }
    await this.submitFamily(() => api.createFamily(name))
  },
  async submitFamily(action) {
    this.setData({ loading: true })
    try {
      const res = await action()
      const app = getApp()
      app.globalData.family = res.family
      wx.setStorageSync('family', res.family)
      wx.switchTab({ url: '/pages/index/index' })
    } catch (err) {
      const msg = err.code === 'ERR_INVITE_CODE_INVALID' ? '邀请码不存在' : (err.message || '操作失败')
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },
})
