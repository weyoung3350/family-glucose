// Sprint 2 验收自动化验证
//
// 覆盖：
//   1. 时段二段选择交互和值兼容
//   2. 大血糖值二次确认与时间精度提示
//   3. 趋势图、矩阵、菜单、家庭、详情页等 UI/UE 验收点
//   4. Sprint 0 关键视觉回归抽样

const automator = require('miniprogram-automator')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const {
  PROJECT_PATH,
  CLI_PATH,
  RESULTS_DIR,
  ensureDirs,
  log,
  pass,
  fail,
  safeShot,
} = require('./helpers')

const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420)
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8080/api/v1'
const RESULTS = []

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function writeSprint2Report(records) {
  const summary = {
    runAt: new Date().toISOString(),
    total: records.length,
    pass: records.filter((r) => r.status === 'pass').length,
    fail: records.filter((r) => r.status === 'fail').length,
    cases: records,
  }
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'sprint2-acceptance.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  return summary
}

function enableAutomationPort() {
  const result = spawnSync(CLI_PATH, [
    'auto',
    '--project',
    PROJECT_PATH,
    '--auto-port',
    String(AUTO_PORT),
    '--trust-project',
  ], {
    encoding: 'utf8',
    timeout: 60000,
  })
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  if (output) {
    for (const line of output.split('\n')) log(`  ${line}`)
  }
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(output || `cli auto 退出码 ${result.status}`)
}

async function connectMiniProgram() {
  enableAutomationPort()
  const wsEndpoint = `ws://127.0.0.1:${AUTO_PORT}`
  let lastError
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      log(`连接自动化端口 ${wsEndpoint}，第 ${attempt} 次...`)
      const mp = await automator.connect({ wsEndpoint, timeout: 10000 })
      await mp.currentPage()
      return mp
    } catch (e) {
      lastError = e
      await sleep(1000)
    }
  }
  throw lastError
}

async function runCase(name, fn) {
  log(`\n=== ${name} ===`)
  try {
    const detail = await fn()
    RESULTS.push(pass(name, detail || ''))
  } catch (e) {
    RESULTS.push(fail(name, e.message || String(e)))
  }
}

async function backendHealth() {
  const res = await fetch(`${API_BASE}/health`)
  const body = await res.json().catch(() => ({}))
  assert(res.ok && body.status === 'ok', `health 异常：${res.status} ${JSON.stringify(body)}`)
  return body
}

async function ensureSession(mp) {
  let state = await mp.evaluate(function () {
    const app = getApp()
    return {
      token: app.globalData.token || wx.getStorageSync('token'),
      family: app.globalData.family || wx.getStorageSync('family'),
    }
  })
  if (!state.token || !state.family) {
    await mp.reLaunch('/pages/join/join')
    await sleep(2000)
    state = await mp.evaluate(function () {
      const app = getApp()
      return {
        token: app.globalData.token || wx.getStorageSync('token'),
        family: app.globalData.family || wx.getStorageSync('family'),
      }
    })
  }
  assert(state.token, '登录态为空')
  assert(state.family, '家庭缓存为空')
  const family = state.family || {}
  return {
    tokenPresent: true,
    family: {
      id: family.id,
      name: family.name,
      role_of_me: family.role_of_me,
      member_count: family.member_count,
    },
  }
}

async function testPeriodPicker(mp) {
  const page = await mp.reLaunch('/pages/add/add')
  await page.waitFor(1000)
  const picker = await page.$('period-picker')
  assert(picker, '缺少 period-picker 组件')

  const meals = await picker.$$('.meal')
  assert(meals.length === 5, `餐次锚点数量异常：${meals.length}`)
  const mealSize = await meals[1].size()
  assert(mealSize.height >= 40, `餐次触达高度偏小：${JSON.stringify(mealSize)}`)

  await meals[1].tap()
  await sleep(300)
  assert(await picker.data('showBeforeAfter') === true, '点击早餐后未显示餐前/餐后')
  const baChips = await picker.$$('.ba-chip')
  assert(baChips.length === 2, `餐前/餐后 chip 数量异常：${baChips.length}`)

  await baChips[0].tap()
  await sleep(300)
  const beforeValue = await page.data('period')
  assert(beforeValue === 'before_breakfast', `选择早餐餐前后 value 异常：${beforeValue}`)

  await meals[0].tap()
  await sleep(300)
  const fastingValue = await page.data('period')
  const showBeforeAfter = await picker.data('showBeforeAfter')
  const afterFastingChips = await picker.$$('.ba-chip')
  assert(fastingValue === 'fasting', `选择空腹后 value 异常：${fastingValue}`)
  assert(showBeforeAfter === false, '选择空腹后仍显示餐前/餐后')
  assert(afterFastingChips.length === 0, `空腹下仍有 ba-chip：${afterFastingChips.length}`)

  await safeShot(mp, 'sprint2-period-picker.png')
  return `mealHeight=${mealSize.height}px before=${beforeValue} fasting=${fastingValue}`
}

async function testHighValueAndTimeHint(mp) {
  const page = await mp.reLaunch('/pages/add/add')
  await page.waitFor(1000)
  await mp.callWxMethod('removeStorageSync', '__sprint2_modal')
  await mp.mockWxMethod('showModal', function (options) {
    const result = { confirm: false, cancel: true, errMsg: 'showModal:ok' }
    wx.setStorageSync('__sprint2_modal', {
      title: options.title,
      content: options.content,
    })
    if (options.success) options.success(result)
    return result
  })

  try {
    const fieldHint = await page.$('.field-hint')
    assert(fieldHint, '缺少时间精度提示')
    const hintText = await fieldHint.text()
    assert(hintText === '（5 分钟刻度）', `时间精度提示异常：${hintText}`)

    await page.setData({ value: '27.5', period: 'fasting', note: '' })
    await page.callMethod('onSave')
    await sleep(500)
    const modal = await mp.callWxMethod('getStorageSync', '__sprint2_modal')
    assert(modal && modal.content === '血糖值 27.5 mmol/L 较高，是否确认录入？', `高值确认弹窗异常：${JSON.stringify(modal)}`)
    await safeShot(mp, 'sprint2-add-high-value.png')
    return `${hintText} · ${modal.content}`
  } finally {
    await mp.restoreWxMethod('showModal')
  }
}

async function testAnalytics(mp) {
  const page = await mp.switchTab('/pages/analytics/analytics')
  await page.waitFor(1500)
  const tip = await page.$('.matrix-tip')
  assert(tip, '矩阵横滑提示缺失')
  const tipText = await tip.text()
  assert(tipText === '‹ 左右滑动查看完整时段 ›', `矩阵横滑提示异常：${tipText}`)
  const cell = await page.$('.cell')
  assert(cell, '矩阵 cell 缺失')
  const cellSize = await cell.size()
  assert(cellSize.height >= 40, `矩阵 cell 高度偏小：${JSON.stringify(cellSize)}`)

  await page.setData({ tab: 'chart' })
  await page.callMethod('loadCurrent')
  await sleep(1200)
  const chartBox = await page.$('.chart-box')
  const canvas = await page.$('.trend-canvas')
  assert(chartBox, '趋势图容器缺失')
  assert(canvas, '趋势图 canvas 缺失')
  const chartSize = await chartBox.size()
  assert(chartSize.height >= 250, `趋势图高度未明显增大：${JSON.stringify(chartSize)}`)

  await safeShot(mp, 'sprint2-analytics-chart.png')
  return `cellHeight=${cellSize.height}px chartHeight=${chartSize.height}px`
}

async function testStandardsToast(mp) {
  const page = await mp.navigateTo('/pages/standards/standards')
  await page.waitFor(1000)
  await page.setData({
    isCreator: true,
    standards: {
      critical_low: 3,
      fasting_low: 4,
      fasting_high: 7,
      postprandial_low: 4,
      postprandial_high: 10,
      critical_high: 15,
    },
  })
  await mp.callWxMethod('removeStorageSync', '__sprint2_toast')
  await mp.mockWxMethod('showModal', function (options) {
    const result = { confirm: true, cancel: false, content: 'abc', errMsg: 'showModal:ok' }
    if (options.success) options.success(result)
    return result
  })
  await mp.mockWxMethod('showToast', function (options) {
    const result = { errMsg: 'showToast:ok' }
    wx.setStorageSync('__sprint2_toast', options.title)
    if (options.success) options.success(result)
    return result
  })

  try {
    await page.callMethod('editValue', { currentTarget: { dataset: { key: 'fasting_low' } } })
    await sleep(500)
    const toast = await mp.callWxMethod('getStorageSync', '__sprint2_toast')
    assert(toast === '请输入 0-50 之间的数字', `标准输入 toast 异常：${toast}`)
    return toast
  } finally {
    await mp.restoreWxMethod('showModal')
    await mp.restoreWxMethod('showToast')
  }
}

async function testFamilyUi(mp) {
  const page = await mp.navigateTo('/pages/family/family')
  await page.waitFor(1200)
  const code = await page.$('.code')
  assert(code, '邀请码缺失')
  const fontFamily = await code.style('fontFamily')
  assert(/Mono|Menlo|Monaco|Consolas|monospace/i.test(fontFamily), `邀请码未使用等宽字体：${fontFamily}`)

  const members = await page.data('members')
  await page.setData({
    isCreator: true,
    members: members.concat([{
      id: 999001,
      nickname: '测试成员',
      role: 'member',
      avatarText: '测',
      roleText: '成员',
      joinedText: '加入于 2026-05-01',
      is_me: false,
    }]),
  })
  await sleep(300)
  const remove = await page.$('.remove')
  assert(remove, '移除按钮缺失')
  const removeText = await remove.text()
  const color = await remove.style('color')
  const borderRadius = await remove.style('borderRadius')
  assert(removeText === '移除', `移除按钮文案异常：${removeText}`)
  assert(borderRadius !== '0px', `移除按钮不是胶囊样式：${borderRadius}`)
  await safeShot(mp, 'sprint2-family-ui.png')
  return `codeFont=${fontFamily} removeColor=${color} radius=${borderRadius}`
}

async function testMeIcons(mp) {
  const page = await mp.switchTab('/pages/me/me')
  await page.waitFor(1000)
  const icons = await page.$$('.icon')
  assert(icons.length === 4, `菜单图标数量异常：${icons.length}`)
  const firstSize = await icons[0].size()
  const bg = await icons[0].style('backgroundColor')
  assert(firstSize.width >= 32 && firstSize.height >= 32, `菜单图标触达偏小：${JSON.stringify(firstSize)}`)
  await safeShot(mp, 'sprint2-me-icons.png')
  return `icons=${icons.length} first=${firstSize.width}x${firstSize.height} bg=${bg}`
}

async function testRecordCardAndSprint0(mp) {
  const page = await mp.switchTab('/pages/index/index')
  await page.waitFor(2000)
  const todayCount = await page.data('todayCount')
  assert(todayCount === 5, `首页 todayCount 异常：${todayCount}`)

  const groups = await page.data('groups')
  const records = groups.reduce((acc, group) => acc.concat(group.items), [])
  assert(records.length > 0, '首页记录为空')

  const currentFive = records.filter((item) => ['过高', '偏高', '一般', '理想', '偏低'].includes(item.status.label))
  const labels = Array.from(new Set(currentFive.map((item) => item.status.label)))
  for (const label of ['过高', '偏高', '一般', '理想', '偏低']) {
    assert(labels.includes(label), `缺少状态档位：${label}`)
  }

  const sprint0High = records.find((item) => Number(item.value) === 8 && item.period === 'fasting')
  const sprint0Normal = records.find((item) => Number(item.value) === 6.5 && item.period === 'fasting')
  assert(sprint0High && sprint0High.status.label === '偏高', `Sprint0 回归失败：8.0 空腹不是偏高`)
  assert(sprint0Normal && sprint0Normal.status.label === '一般', `Sprint0 回归失败：6.5 空腹不是一般`)
  assert(records.some((item) => item.source === 'ai'), 'Sprint0 回归失败：首页没有 AI 记录')

  const cards = await page.$$('record-card')
  const widths = []
  for (const card of cards.slice(0, 5)) {
    const status = await card.$('.status')
    assert(status, 'record-card 缺少 status chip')
    const size = await status.size()
    widths.push(size.width)
  }
  const spread = Math.max(...widths) - Math.min(...widths)
  assert(spread <= 8, `状态 chip 宽度不够对齐：${widths.join(', ')}`)

  const fabRow = await page.$('.fab-row')
  assert(fabRow, '首页底部按钮缺失')
  const bottom = await fabRow.style('bottom')
  assert(bottom !== '0px', `首页底部按钮可能与 home indicator 重叠：bottom=${bottom}`)
  await safeShot(mp, 'sprint2-home-regression.png')
  return `today=${todayCount} statuses=${labels.join('/')} chipWidths=${widths.join(',')} bottom=${bottom}`
}

async function testDetailEmptyNote(mp) {
  const home = await mp.switchTab('/pages/index/index')
  await home.waitFor(1500)
  const groups = await home.data('groups')
  const records = groups.reduce((acc, group) => acc.concat(group.items), [])
  const record = records.find((item) => !item.note)
  assert(record, '未找到空备注记录')

  const detail = await mp.navigateTo(`/pages/detail/detail?id=${record.id}`)
  await detail.waitFor(1500)
  const meta = await detail.$('.meta')
  assert(meta, '详情页 meta 缺失')
  const metaText = await meta.text()
  assert(metaText.includes('（无备注）'), `详情页空备注文案异常：${metaText}`)
  const more = await detail.$('.more')
  assert(more, 'creator 身份详情页未显示更多操作入口')
  await safeShot(mp, 'sprint2-detail-empty-note.png')
  return `record=${record.id} note=（无备注） more=true`
}

async function testAddSafeArea(mp) {
  const page = await mp.reLaunch('/pages/add/add')
  await page.waitFor(1000)
  const saveBar = await page.$('.save-bar')
  assert(saveBar, '保存栏缺失')
  const bottom = await saveBar.style('bottom')
  assert(bottom !== '0px', `保存栏可能与 home indicator 重叠：bottom=${bottom}`)
  return `saveBarBottom=${bottom}`
}

;(async () => {
  ensureDirs()
  let mp
  try {
    mp = await connectMiniProgram()
    await mp.restoreWxMethod('showModal').catch(() => {})
    await mp.restoreWxMethod('showToast').catch(() => {})
    await runCase('后端 health 200', backendHealth)
    await runCase('登录态与家庭缓存存在', () => ensureSession(mp))
    await runCase('时段二段选择', () => testPeriodPicker(mp))
    await runCase('大值二次确认与时间提示', () => testHighValueAndTimeHint(mp))
    await runCase('分析页矩阵与趋势图', () => testAnalytics(mp))
    await runCase('自定义标准输入校验', () => testStandardsToast(mp))
    await runCase('家庭页邀请码与移除按钮', () => testFamilyUi(mp))
    await runCase('我的页菜单图标', () => testMeIcons(mp))
    await runCase('首页状态 chip 与 Sprint0 回归', () => testRecordCardAndSprint0(mp))
    await runCase('详情页空备注与 creator 操作入口', () => testDetailEmptyNote(mp))
    await runCase('底部 safe-area', () => testAddSafeArea(mp))
  } finally {
    if (mp) mp.disconnect()
  }
  const summary = writeSprint2Report(RESULTS)
  log(`\nSprint 2 验收汇总：${summary.pass}/${summary.total} 通过，${summary.fail} 失败`)
  if (summary.fail > 0) process.exitCode = 1
})()
