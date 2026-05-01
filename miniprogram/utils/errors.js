// 后端 raise 的所有 ERR_*，前端集中映射为中文文案
// 当后端 detail 里已经带 message 时优先用 message（避免重复维护），
// 这里只是给"后端漏写 message"或"前端要换更友好文案"做兜底。
const ERROR_LABELS = {
  // 网络
  ERR_NETWORK: '无法连接服务器',
  ERR_TIMEOUT: '请求超时，请检查网络后重试',
  ERR_HTTP: '服务异常，请稍后再试',

  // 鉴权
  ERR_TOKEN_INVALID: '登录已失效，请重新打开小程序',
  ERR_NOT_IN_FAMILY: '请先加入家庭',
  ERR_PERMISSION_DENIED: '没有权限',
  ERR_FORBIDDEN: '无权操作',

  // 微信登录
  ERR_WX_API: '微信登录服务异常',
  ERR_WX_CODE_INVALID: '登录凭证已失效，请重试',

  // 家庭
  ERR_USER_ALREADY_IN_FAMILY: '已经加入家庭，无需重复创建',
  ERR_INVITE_CODE_INVALID: '邀请码不存在',
  ERR_INVITE_CODE_GENERATE_FAILED: '邀请码生成失败，请重试',
  ERR_FAMILY_NOT_FOUND: '家庭不存在',
  ERR_USER_NOT_FOUND: '用户不存在',
  ERR_USER_NOT_IN_FAMILY: '用户不在当前家庭',
  ERR_CANNOT_REMOVE_SELF: '不能移除自己',
  ERR_CREATOR_CANNOT_LEAVE: '管理员不能退出家庭，如需放弃请解散',

  // 个人资料
  ERR_NICKNAME_EMPTY: '昵称不能为空',
  ERR_NICKNAME_TOO_LONG: '昵称最多 20 个字',

  // 记录
  ERR_RECORD_NOT_FOUND: '记录不存在',
  ERR_INVALID_PERIOD: '时段不正确',
  ERR_INVALID_SOURCE: '来源不正确',
  ERR_INVALID_RANGE: '日期范围不正确',
  ERR_RANGE_TOO_LARGE: '查询区间过大',

  // 标准
  ERR_STANDARDS_INVALID: '血糖标准不正确',

  // AI 文本解析
  ERR_AI_PARSE: '内容格式无法识别，请换种说法或手动录入',

  // ASR 语音
  ERR_AUDIO_EMPTY: '录音为空，请重新长按说话',
  ERR_AUDIO_TOO_LARGE: '录音过长，请缩短到 60 秒内',
  ERR_ASR_NOT_CONFIGURED: '语音识别未配置',
  ERR_ASR_NETWORK: '语音识别服务连接失败',
  ERR_ASR_HTTP: '语音识别服务异常，请稍后再试',
  ERR_ASR_PARSE: '语音识别响应格式异常',
  ERR_ASR_EMPTY: '没听清，请再说一遍',
}

function describe(err) {
  if (!err) return '操作失败'
  if (typeof err === 'string') return err
  if (err.code && ERROR_LABELS[err.code]) return ERROR_LABELS[err.code]
  if (err.message) return err.message
  return '操作失败'
}

function toast(err, fallback) {
  wx.showToast({ title: describe(err) || fallback || '操作失败', icon: 'none' })
}

module.exports = { describe, toast, ERROR_LABELS }
