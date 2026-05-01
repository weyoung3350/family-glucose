const { api } = require('../../utils/api.js')
const { relative, dateOnly } = require('../../utils/time.js')
const offline = require('../../utils/offline.js')

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
  onLoad() { this.loadFirstPage() },
  onShow() {
    const app = getApp()
    if (!app.globalData.family) {
      wx.reLaunch({ url: '/pages/join/join' })
      return
    }
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
      wx.showToast({ title: err.message || '加载失败', icon: 'none' })
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
