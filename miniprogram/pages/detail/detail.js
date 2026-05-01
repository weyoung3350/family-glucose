const { api } = require('../../utils/api.js')
const { formatDate } = require('../../utils/time.js')

Page({
  data: {
    id: null,
    record: null,
    isMine: false,
  },
  onLoad(query) {
    const id = Number(query.id)
    if (!id || Number.isNaN(id)) {
      wx.showToast({ title: '记录不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({ id })
    this.loadRecord()
  },
  onShow() {
    if (this.data.id) this.loadRecord()
  },
  async loadRecord() {
    const record = await api.getRecord(this.data.id)
    record.measuredText = formatDate(record.measured_at)
    record.createdText = formatDate(record.created_at)
    const app = getApp()
    const user = app.globalData.user || {}
    const family = app.globalData.family || {}
    const canEdit = record.recorder.id === user.id || family.role_of_me === 'creator'
    this.setData({ record, isMine: canEdit })
  },
  onEdit() { wx.navigateTo({ url: `/pages/add/add?id=${this.data.id}` }) },
  onMore() {
    if (!this.data.isMine) return
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) this.onEdit()
        if (res.tapIndex === 1) this.onDelete()
      },
    })
  },
  onDelete() {
    wx.showModal({
      title: '删除记录',
      content: '删除后无法恢复，确认删除吗？',
      success: async (res) => {
        if (!res.confirm) return
        await api.deleteRecord(this.data.id)
        wx.navigateBack()
      },
    })
  },
})
