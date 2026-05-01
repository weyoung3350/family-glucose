const { api } = require('../../utils/api.js')
const errors = require('../../utils/errors.js')

Page({
  data: { user: {}, family: {}, roleText: '未加入', avatarText: '我' },
  onShow() {
    this.refresh()
    this.refreshFromServer()
  },
  refresh() {
    const app = getApp()
    const user = app.globalData.user || {}
    const family = app.globalData.family || {}
    this.setData({
      user,
      family,
      roleText: family.role_of_me === 'creator' ? '管理员' : (family.role_of_me === 'member' ? '成员' : '未加入'),
      avatarText: user.nickname ? user.nickname.slice(0, 1) : '我',
    })
  },
  async refreshFromServer() {
    try {
      const fresh = await api.getMe()
      const app = getApp()
      app.globalData.user = fresh
      wx.setStorageSync('user', fresh)
      this.refresh()
    } catch (err) {
      // 静默失败：保持本地缓存即可
    }
  },
  editNickname() {
    const current = (this.data.user && this.data.user.nickname) || ''
    wx.showModal({
      title: '修改昵称',
      placeholderText: current || '例如：儿子、小张妈、二姐',
      editable: true,
      content: current,
      success: async (res) => {
        if (!res.confirm) return
        const nickname = (res.content || '').trim()
        if (!nickname) {
          wx.showToast({ title: '昵称不能为空', icon: 'none' })
          return
        }
        try {
          const updated = await api.updateProfile({ nickname })
          const app = getApp()
          app.globalData.user = updated
          wx.setStorageSync('user', updated)
          this.refresh()
          wx.showToast({ title: '已修改' })
        } catch (err) {
          errors.toast(err, '修改失败')
        }
      },
    })
  },
  goFamily() { wx.navigateTo({ url: '/pages/family/family' }) },
  goStandards() { wx.navigateTo({ url: '/pages/standards/standards' }) },
  goExport() { wx.navigateTo({ url: '/pages/export/export' }) },
  goAbout() { wx.navigateTo({ url: '/pages/about/about' }) },
})
