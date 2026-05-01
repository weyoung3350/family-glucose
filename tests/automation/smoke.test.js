// 小程序核心流程自动化 smoke 测试
//
// 覆盖：
//   1. 后端 health
//   2. 首页基础渲染与中老年友好触控尺寸
//   3. 手动录入真实表单流程
//   4. AI 一句话解析与保存流程
//   5. 统计页矩阵/趋势/报表加载
//   6. 我的页与导出页预览

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
  skip,
  safeShot,
} = require('./helpers')

const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420)
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8080/api/v1'
const RESULTS = []

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeSmokeReport(records) {
  const summary = {
    runAt: new Date().toISOString(),
    total: records.length,
    pass: records.filter((r) => r.status === 'pass').length,
    fail: records.filter((r) => r.status === 'fail').length,
    skip: records.filter((r) => r.status === 'skip').length,
    cases: records,
  }
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'smoke-results.json'),
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
  if (result.status !== 0) {
    throw new Error(output || `cli auto 退出码 ${result.status}`)
  }
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

async function backendHealth() {
  const res = await fetch(`${API_BASE}/health`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok || body.status !== 'ok') {
    throw new Error(`health 异常：${res.status} ${JSON.stringify(body)}`)
  }
  return body
}

async function ensureLoggedIn(mp) {
  await mp.callWxMethod('removeStorageSync', 'token')
  await mp.callWxMethod('removeStorageSync', 'user')
  await mp.callWxMethod('removeStorageSync', 'family')
  await mp.callWxMethod('clearStorage')
  await mp.reLaunch('/pages/join/join')
  await sleep(1500)
  const state = await mp.evaluate(function () {
    const app = getApp()
    return {
      token: app.globalData.token || wx.getStorageSync('token'),
      family: app.globalData.family || wx.getStorageSync('family'),
    }
  })
  if (!state.token) throw new Error('登录态为空')
  return state
}

async function ensureFamily(mp) {
  const state = await mp.evaluate(function () {
    const app = getApp()
    return app.globalData.family || wx.getStorageSync('family')
  })
  if (state) return state

  const token = await mp.evaluate(function () {
    const app = getApp()
    return app.globalData.token || wx.getStorageSync('token')
  })
  const res = await fetch(`${API_BASE}/families`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: '自动化测试家' }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.message || `创建家庭失败：${res.status}`)
  await mp.evaluate(function (family) {
    const app = getApp()
    app.globalData.family = family
    wx.setStorageSync('family', family)
  }, body.family)
  return body.family
}

async function assertHome(mp) {
  const home = await mp.reLaunch('/pages/index/index')
  await home.waitFor(1500)
  const title = await home.$('.title')
  const fab = await home.$('.fab-main')
  const mic = await home.$('.fab-mic')
  const titleText = title ? await title.text() : ''
  if (!titleText.includes('血糖记录')) throw new Error(`首页标题异常：${titleText}`)
  if (!fab || !mic) throw new Error('首页缺少手动/AI 录入入口')

  const fabSize = await fab.size()
  const micSize = await mic.size()
  if (fabSize.height < 44 || micSize.width < 44 || micSize.height < 44) {
    throw new Error(`触控尺寸偏小：fab=${JSON.stringify(fabSize)} mic=${JSON.stringify(micSize)}`)
  }
  await safeShot(mp, 'smoke-home.png')
  return { home, titleText, fabSize, micSize }
}

async function runManualAdd(mp, home) {
  const beforeCount = Number(await home.data('todayCount')) || 0
  const add = await mp.navigateTo('/pages/add/add')
  const valueInput = await add.$('.value-input')
  const noteInput = await add.$('.note-input')
  const save = await add.$('.btn-primary')
  if (!valueInput || !noteInput || !save) throw new Error('手动录入页关键控件缺失')

  await valueInput.input('6.8')
  await noteInput.input('自动化 smoke 手动录入')
  const value = await add.data('value')
  if (value !== '6.8') throw new Error(`血糖值输入未生效：${value}`)
  await safeShot(mp, 'smoke-manual-add.png')
  await save.tap()
  await sleep(2500)

  const current = await mp.currentPage()
  if (current.path !== 'pages/index/index') throw new Error(`保存后未回首页：${current.path}`)
  await current.waitFor(1000)
  const afterCount = Number(await current.data('todayCount')) || 0
  if (afterCount <= beforeCount) throw new Error(`今日记录数未增加：${beforeCount} -> ${afterCount}`)
  return current
}

async function runAiAdd(mp) {
  const aiPage = await mp.navigateTo('/pages/ai-add/ai-add')
  const textarea = await aiPage.$('textarea')
  if (!textarea) throw new Error('AI 录入页缺少文本输入框')
  await textarea.input('早上 9:25 空腹血糖 9.9，自动化AI测试')
  await sleep(1500)
  const parsed = await aiPage.data('parsed')
  if (!parsed || Number(parsed.value) !== 9.9 || parsed.period !== 'fasting') {
    throw new Error(`AI 解析异常：${JSON.stringify(parsed)}`)
  }
  const save = await aiPage.$('.btn-primary')
  if (!save) throw new Error('AI 录入页缺少确认保存按钮')
  await safeShot(mp, 'smoke-ai-add.png')
  await save.tap()
  await sleep(2500)
  const current = await mp.currentPage()
  if (current.path !== 'pages/index/index') throw new Error(`AI 保存后未回首页：${current.path}`)
  return current
}

async function assertAnalytics(mp) {
  const analytics = await mp.switchTab('/pages/analytics/analytics')
  await analytics.waitFor(1500)
  const matrix = await analytics.data('matrix')
  if (!Array.isArray(matrix) || matrix.length === 0) throw new Error('矩阵数据为空')

  await analytics.setData({ tab: 'chart' })
  await analytics.callMethod('loadCurrent')
  await sleep(800)
  const chart = await analytics.data('chart')
  if (!chart || !chart.stats) throw new Error('趋势图数据为空')

  await analytics.setData({ tab: 'report' })
  await analytics.callMethod('loadCurrent')
  await sleep(800)
  const report = await analytics.data('report')
  if (!report || !report.summary) throw new Error('报表数据为空')
  await safeShot(mp, 'smoke-analytics-report.png')
}

async function assertMeAndExport(mp) {
  const me = await mp.switchTab('/pages/me/me')
  await me.waitFor(1000)
  const nickname = await me.$('.nickname')
  const family = await me.$('.family')
  if (!nickname || !family) throw new Error('我的页资料区缺失')

  const exportPage = await mp.navigateTo('/pages/export/export')
  await exportPage.waitFor(1500)
  const total = await exportPage.data('total')
  const button = await exportPage.$('.btn-primary')
  if (typeof total !== 'number') throw new Error(`导出页 total 异常：${total}`)
  if (!button) throw new Error('导出页缺少生成 CSV 入口')
  await safeShot(mp, 'smoke-export-preview.png')
}

async function runCase(name, fn) {
  log(`\n=== ${name} ===`)
  try {
    const detail = await fn()
    RESULTS.push(pass(name, detail || ''))
    return detail
  } catch (e) {
    RESULTS.push(fail(name, e.message || String(e)))
    return null
  }
}

;(async () => {
  ensureDirs()
  let mp
  try {
    await runCase('后端 health 正常', async () => {
      const body = await backendHealth()
      return `${body.app} ${body.version}`
    })

    mp = await connectMiniProgram()
    await runCase('微信登录态与家庭就绪', async () => {
      const state = await ensureLoggedIn(mp)
      const family = state.family || await ensureFamily(mp)
      return `family=${family && family.name ? family.name : '(已加入)'}`
    })

    let home = null
    await runCase('首页渲染与触控尺寸达标', async () => {
      const result = await assertHome(mp)
      home = result.home
      return `title=${result.titleText}`
    })

    await runCase('手动录入真实表单保存成功', async () => {
      if (!home) throw new Error('首页前置未通过')
      home = await runManualAdd(mp, home)
      return '今日记录数已增加'
    })

    await runCase('AI 一句话解析并保存成功', async () => {
      await runAiAdd(mp)
      return 'AI 解析 value=9.9 period=fasting'
    })

    await runCase('统计页矩阵/趋势/报表加载成功', async () => {
      await assertAnalytics(mp)
      return 'matrix/chart/report 均有数据'
    })

    await runCase('我的页与导出预览可用', async () => {
      await assertMeAndExport(mp)
      return '未触发 CSV 分享'
    })
  } catch (e) {
    RESULTS.push(fail('主流程', e.message || String(e)))
  } finally {
    try {
      if (mp) mp.disconnect()
    } catch (e) {}

    const summary = writeSmokeReport(RESULTS)
    log(`\n=== smoke 汇总 ===`)
    log(`总数: ${summary.total}  通过: ${summary.pass}  失败: ${summary.fail}  跳过: ${summary.skip}`)
    log('详情: tests/automation/results/smoke-results.json')
    process.exit(summary.fail > 0 ? 1 : 0)
  }
})()
