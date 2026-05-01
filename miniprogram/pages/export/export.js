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
    if (this.data.total === 0) {
      wx.showToast({ title: '当前区间没有记录', icon: 'none' })
      return
    }
    const url = api.csvUrl({ from: this.data.from, to: this.data.to })
    wx.showLoading({ title: '生成中…', mask: true })
    wx.downloadFile({
      url,
      success: (res) => {
        wx.hideLoading()
        if (res.statusCode !== 200) {
          wx.showToast({ title: `下载失败（${res.statusCode}）`, icon: 'none' })
          return
        }
        wx.showToast({ title: '已生成', icon: 'success', duration: 800 })
        setTimeout(() => {
          wx.shareFileMessage({
            filePath: res.tempFilePath,
            fail: () => wx.openDocument({ filePath: res.tempFilePath, fileType: 'csv' }),
          })
        }, 800)
      },
      fail: (err) => {
        wx.hideLoading()
        const errMsg = (err && err.errMsg) || ''
        if (errMsg.indexOf('url not in domain list') >= 0) {
          wx.showModal({
            title: 'CSV 导出未启用',
            content: '请联系管理员在小程序后台开通 downloadFile 合法域名',
            showCancel: false,
          })
        } else {
          wx.showToast({ title: '下载失败：' + (errMsg || '网络异常'), icon: 'none' })
        }
      },
    })
  },
})
