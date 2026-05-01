const offline = require('./utils/offline.js')

function tryFlushOffline() {
  const { api } = require('./utils/api.js')
  return offline.flush(api).then((res) => {
    if (res.ok > 0) {
      wx.showToast({ title: `已同步 ${res.ok} 条记录`, icon: 'success' })
    }
  }).catch(() => {})
}

App({
  globalData: {
    token: null,
    user: null,
    family: null,
    apiBase: 'https://glucose-api.bwton.com/api/v1',
    bootstrapping: false, // 冷启动 relogin 进行中标记
  },
  onLaunch(options) {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
      this.globalData.user = wx.getStorageSync('user')
      this.globalData.family = wx.getStorageSync('family')
    }

    const sharedCode = options && options.query ? options.query.code : ''
    if (!this.globalData.token) {
      this.globalData.bootstrapping = true
      const { relogin } = require('./utils/api.js')
      relogin().then((res) => {
        this.globalData.bootstrapping = false
        if (!res.family) {
          wx.reLaunch({ url: `/pages/join/join${sharedCode ? `?code=${sharedCode}` : ''}` })
        } else {
          tryFlushOffline()
        }
      }).catch(() => {
        this.globalData.bootstrapping = false
        wx.reLaunch({ url: `/pages/join/join${sharedCode ? `?code=${sharedCode}` : ''}` })
      })
      return
    }

    if (!this.globalData.family) {
      wx.reLaunch({ url: `/pages/join/join${sharedCode ? `?code=${sharedCode}` : ''}` })
    } else {
      tryFlushOffline()
    }
  },
  onShow() {
    if (this.globalData.token && this.globalData.family) {
      tryFlushOffline()
    }
  },
})
