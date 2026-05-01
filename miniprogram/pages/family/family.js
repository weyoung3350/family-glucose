const { api } = require('../../utils/api.js')
const { shareInviteCode } = require('../../utils/share.js')
const { formatDate } = require('../../utils/time.js')

Page({
  data: { family: null, members: [], isCreator: false },
  onLoad() { this.loadFamily() },
  async loadFamily() {
    const res = await api.getFamily()
    const members = res.members.map((member) => ({
      ...member,
      avatarText: member.nickname ? member.nickname.slice(0, 1) : '我',
      roleText: member.role === 'creator' ? '管理员' : '成员',
      joinedText: member.joined_at ? `加入于 ${formatDate(member.joined_at)}` : '',
    }))
    const app = getApp()
    app.globalData.family = res.family
    wx.setStorageSync('family', res.family)
    this.setData({ family: res.family, members, isCreator: res.family.role_of_me === 'creator' })
  },
  copyCode() {
    const code = this.data.family && this.data.family.invite_code
    if (!code) {
      wx.showToast({ title: '邀请码不可用', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败，请手动选择长按复制', icon: 'none' }),
    })
  },
  editName() {
    wx.showModal({
      title: '修改家庭名',
      editable: true,
      placeholderText: this.data.family.name,
      success: async (res) => {
        if (!res.confirm || !res.content.trim()) return
        await api.updateFamily(res.content.trim())
        this.loadFamily()
      },
    })
  },
  removeMember(event) {
    const id = event.currentTarget.dataset.id
    wx.showModal({
      title: '移除成员',
      content: '确认将该成员移出家庭吗？',
      success: async (res) => {
        if (!res.confirm) return
        await api.removeMember(id)
        this.loadFamily()
      },
    })
  },
  leaveFamily() {
    wx.showModal({
      title: '退出家庭',
      content: '退出后将无法查看当前家庭数据，确认吗？',
      success: async (res) => {
        if (!res.confirm) return
        await api.leaveFamily()
        this.clearFamilyAndGoJoin()
      },
    })
  },
  dissolveFamily() {
    wx.showModal({
      title: '解散家庭',
      content: '解散后所有家人无法再访问数据，确认吗？',
      success: async (res) => {
        if (!res.confirm) return
        await api.dissolveFamily()
        this.clearFamilyAndGoJoin()
      },
    })
  },
  clearFamilyAndGoJoin() {
    getApp().globalData.family = null
    wx.removeStorageSync('family')
    wx.reLaunch({ url: '/pages/join/join' })
  },
  onShareAppMessage() {
    return shareInviteCode(this.data.family)
  },
})
