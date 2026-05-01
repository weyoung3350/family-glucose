const { api } = require('../../utils/api.js')
const { daysAgo, dateOnly } = require('../../utils/time.js')

Page({
  data: { days: 30, from: '', to: '', total: 0, ranges: [7, 30, 90] },
  onLoad() { this.setRange(30) },
  setRange(days) {
    const from = daysAgo(days)
    const to = dateOnly(new Date())
    this.setData({ days, from, to })
    this.loadPreview()
  },
  onRangeTap(event) {
    this.setRange(Number(event.currentTarget.dataset.days))
  },
  async loadPreview() {
    const res = await api.listRecords({ from: this.data.from, to: this.data.to, page: 1, size: 1 })
    this.setData({ total: res.total })
  },
  async onDownload() {
    if (this.data.total === 0) wx.showToast({ title: '没有记录', icon: 'none' })
    const url = api.csvUrl({ from: this.data.from, to: this.data.to })
    wx.downloadFile({
      url,
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: '下载失败', icon: 'none' })
          return
        }
        wx.shareFileMessage({
          filePath: res.tempFilePath,
          fail: () => wx.openDocument({ filePath: res.tempFilePath, fileType: 'csv' }),
        })
      },
      fail: () => wx.showToast({ title: '下载失败', icon: 'none' }),
    })
  },
})
