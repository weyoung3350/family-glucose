Page({
  data: { user: {}, family: {}, roleText: '未加入', avatarText: '我' },
  onShow() {
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
  goFamily() { wx.navigateTo({ url: '/pages/family/family' }) },
  goStandards() { wx.navigateTo({ url: '/pages/standards/standards' }) },
  goExport() { wx.navigateTo({ url: '/pages/export/export' }) },
  goAbout() { wx.navigateTo({ url: '/pages/about/about' }) },
})
