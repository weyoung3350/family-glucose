const { api } = require('../../utils/api.js')
const { relative, dateOnly } = require('../../utils/time.js')
const offline = require('../../utils/offline.js')
const errors = require('../../utils/errors.js')

Page({
  data: {
    family: null,
    groups: [],
    page: 1,
    size: 20,
    hasMore: true,
    loading: false,
    todayCount: 0,
    todayLabel: '一家人一起守护血糖',
    highlightId: null,
    offlineCount: 0,
  },
  onLoad() { /* 等 onShow 时再决定加载，避免 bootstrapping 中冲突 */ },
  onShow() {
    this.bootstrapAndShow()
  },
  bootstrapAndShow(retried) {
    const app = getApp()
    if (app.globalData.family) {
      this.continueShow()
      return
    }
    // 没 family：可能是冷启动 relogin 还没完成（bootstrapping=true），等等看
    if (app.globalData.bootstrapping) {
      wx.showLoading({ title: '加载中…', mask: true })
      const start = Date.now()
      const tick = () => {
        if (app.globalData.family) {
          wx.hideLoading()
          this.continueShow()
          return
        }
        if (!app.globalData.bootstrapping) {
          wx.hideLoading()
          // bootstrapping 已结束但仍无 family → 真没家庭 → 跳 join
          wx.reLaunch({ url: '/pages/join/join' })
          return
        }
        if (Date.now() - start > 8000) {
          wx.hideLoading()
          wx.showToast({ title: '加载超时，请重试', icon: 'none' })
          wx.reLaunch({ url: '/pages/join/join' })
          return
        }
        setTimeout(tick, 200)
      }
      tick()
      return
    }
    // 不在 bootstrapping 也没 family → 真无家庭
    wx.reLaunch({ url: '/pages/join/join' })
  },
  continueShow() {
    const app = getApp()
    const pending = wx.getStorageSync('pending_highlight_id')
    if (pending) {
      wx.removeStorageSync('pending_highlight_id')
      this.setData({ highlightId: pending })
      setTimeout(() => this.setData({ highlightId: null }), 2500)
    }
    this.setData({ family: app.globalData.family, offlineCount: offline.queueSize() })
    this.loadFirstPage()
  },
  onPullDownRefresh() {
    this.loadFirstPage().finally(() => wx.stopPullDownRefresh())
  },
  onReachBottom() {
    if (!this.data.hasMore || this.data.loading) return
    this.loadRecords(this.data.page + 1)
  },
  async loadFirstPage() {
    this.setData({ page: 1, hasMore: true })
    await this.loadRecords(1)
  },
  async loadRecords(page) {
    this.setData({ loading: true })
    try {
      const res = await api.listRecords({ page, size: this.data.size })
      const items = page === 1 ? res.items : this.flattenGroups().concat(res.items)
      this.setData({
        groups: this.groupRecords(items),
        page,
        hasMore: page * this.data.size < res.total,
        todayCount: typeof res.total_today === 'number' ? res.total_today : items.filter((item) => dateOnly(item.measured_at) === dateOnly(new Date())).length,
      })
    } catch (err) {
      errors.toast(err, '加载失败')
    } finally {
      this.setData({ loading: false })
    }
  },
  flattenGroups() {
    return this.data.groups.reduce((acc, group) => acc.concat(group.items), [])
  },
  groupRecords(records) {
    const map = {}
    records.forEach((record) => {
      const key = dateOnly(record.measured_at)
      if (!map[key]) map[key] = { date: key, label: relative(record.measured_at), items: [] }
      map[key].items.push(record)
    })
    return Object.values(map)
  },
  onAddTap() { wx.navigateTo({ url: '/pages/add/add' }) },
  onMicTap() { wx.navigateTo({ url: '/pages/add/add?mode=ai' }) },
  onCardTap(event) {
    const id = event.detail.id || event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },
})
