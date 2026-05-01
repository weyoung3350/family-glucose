const { API_BASE } = require('./const.js')

function appendQuery(url, query) {
  const qs = Object.entries(query || {})
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return qs ? `${url}?${qs}` : url
}

function request(method, path, { data, query, headers } = {}) {
  const app = getApp()
  const url = appendQuery(API_BASE + path, query)
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method,
      data,
      timeout: 15000,
      header: {
        'Content-Type': 'application/json',
        ...(app.globalData.token ? { Authorization: `Bearer ${app.globalData.token}` } : {}),
        ...headers,
      },
      success: (res) => {
        if (res.statusCode === 401) {
          app.globalData.token = null
          wx.removeStorageSync('token')
          relogin().then(() => request(method, path, { data, query, headers })).then(resolve, reject)
          return
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data || {})
        } else {
          reject(res.data && res.data.code ? res.data : { code: 'ERR_HTTP', message: '网络异常' })
        }
      },
      fail: (err) => {
        const isTimeout = err && err.errMsg && err.errMsg.indexOf('timeout') >= 0
        reject({
          code: isTimeout ? 'ERR_TIMEOUT' : 'ERR_NETWORK',
          message: isTimeout ? '请求超时，请检查网络后重试' : '无法连接服务器',
        })
      },
    })
  })
}

function wxLogin() {
  return new Promise((resolve, reject) => {
    wx.login({ success: resolve, fail: reject })
  })
}

async function relogin() {
  const loginResult = await wxLogin()
  const userInfo = wx.getStorageSync('userInfo') || {}
  const result = await request('POST', '/auth/login', {
    data: { code: loginResult.code, nickname: userInfo.nickName, avatar_url: userInfo.avatarUrl },
  })
  const app = getApp()
  app.globalData.token = result.token
  app.globalData.user = result.user
  app.globalData.family = result.family
  wx.setStorageSync('token', result.token)
  wx.setStorageSync('user', result.user)
  wx.setStorageSync('family', result.family)
  return result
}

const api = {
  login: (data) => request('POST', '/auth/login', { data }),
  createFamily: (name) => request('POST', '/families', { data: { name } }),
  joinFamily: (invite_code) => request('POST', '/families/join', { data: { invite_code } }),
  getFamily: () => request('GET', '/families/me'),
  updateFamily: (name) => request('PATCH', '/families/me', { data: { name } }),
  removeMember: (uid) => request('DELETE', `/families/me/members/${uid}`),
  leaveFamily: () => request('POST', '/families/me/leave'),
  dissolveFamily: () => request('DELETE', '/families/me'),
  getStandards: () => request('GET', '/families/me/standards'),
  updateStandards: (data) => request('PATCH', '/families/me/standards', { data }),
  listRecords: (query) => request('GET', '/records', { query }),
  getRecord: (id) => request('GET', `/records/${id}`),
  createRecord: (data) => request('POST', '/records', { data }),
  updateRecord: (id, data) => request('PATCH', `/records/${id}`, { data }),
  deleteRecord: (id) => request('DELETE', `/records/${id}`),
  matrix: (query) => request('GET', '/analytics/matrix', { query }),
  chart: (query) => request('GET', '/analytics/chart', { query }),
  report: (query) => request('GET', '/analytics/report', { query }),
  csvUrl: (query) => appendQuery(`${API_BASE}/export/csv`, { ...query, token: getApp().globalData.token }),
  parseRecord: (text) => request('POST', '/ai/parse-record', { data: { text } }),
  getMe: () => request('GET', '/users/me'),
  updateProfile: (data) => request('PATCH', '/users/me', { data }),
}

module.exports = { api, relogin, request }
