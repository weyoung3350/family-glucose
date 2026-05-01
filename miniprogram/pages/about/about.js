const { APP_VERSION } = require('../../utils/const.js')

Page({
  data: { version: APP_VERSION },
  showUsage() { wx.showModal({ title: '使用说明', content: '家人可共同记录、查看和导出家人的血糖数据。' }) },
  showPrivacy() { wx.showModal({ title: '隐私说明', content: '数据仅供家庭内部使用，请妥善保管账号和邀请码。' }) },
  copyEmail() {
    wx.setClipboardData({ data: 'weyoung8899@gmail.com' })
  },
})
