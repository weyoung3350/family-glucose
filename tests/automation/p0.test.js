// P0 视觉问题自动化验证
//
// 覆盖：
//   P0-1 · AI 录入卡片应展示 AI 角标，普通卡片不展示
//   P0-2 · 新建记录后回到首页，对应卡片应在 2s 内带 highlight class，之后消失
//   P0-3 · 家庭管理页成员的 joined_at 应正确渲染为 "加入于 YYYY-MM-DD"

const automator = require('miniprogram-automator')
const { spawnSync } = require('child_process')

const {
  PROJECT_PATH,
  CLI_PATH,
  ensureDirs,
  log,
  pass,
  fail,
  skip,
  safeShot,
  writeReport,
} = require('./helpers')

const RESULTS = []
const AUTO_PORT = Number(process.env.WECHAT_AUTO_PORT || 9420)
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8080/api/v1'

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function enableAutomationPort() {
  const args = [
    'auto',
    '--project',
    PROJECT_PATH,
    '--auto-port',
    String(AUTO_PORT),
    '--trust-project',
  ]
  const result = spawnSync(CLI_PATH, args, {
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

async function createMiniProgramSession() {
  log('启用当前开发者工具自动化端口...')
  enableAutomationPort()
  const wsEndpoint = `ws://127.0.0.1:${AUTO_PORT}`
  let lastError
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      log(`连接自动化端口 ${wsEndpoint}，第 ${attempt} 次...`)
      const mp = await automator.connect({
        wsEndpoint,
        timeout: 10000,
      })
      await mp.currentPage()
      return { mp, shouldCloseDevTools: false, mode: 'connect' }
    } catch (e) {
      lastError = e
      await sleep(1000)
    }
  }
  throw lastError
}

async function setupSession(mp) {
  // 清登录态，确保走完整登录流程
  await mp.callWxMethod('removeStorageSync', 'token')
  await mp.callWxMethod('removeStorageSync', 'user')
  await mp.callWxMethod('removeStorageSync', 'family')
  await mp.callWxMethod('clearStorage')

  // 重启从 launch
  const page = await mp.reLaunch('/pages/join/join')
  await page.waitFor(1000)
  return page
}

async function getToken(mp) {
  return await mp.evaluate(function () {
    const app = getApp()
    return app.globalData.token || wx.getStorageSync('token')
  })
}

function appendQuery(url, query) {
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== null && value !== undefined && value !== '') {
      qs.set(key, value)
    }
  }
  const queryText = qs.toString()
  return queryText ? `${url}?${queryText}` : url
}

async function apiRequest(mp, method, apiPath, { data, query } = {}) {
  const token = await getToken(mp)
  if (!token) throw new Error('小程序登录态为空，无法调用后端 API')

  const res = await fetch(appendQuery(`${API_BASE}${apiPath}`, query), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: data ? JSON.stringify(data) : undefined,
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`${res.status} ${body.code || 'ERR_HTTP'} ${body.message || '请求失败'}`)
  }
  return body
}

async function setFamilyCache(mp, family) {
  await mp.evaluate(function (familyData) {
    const app = getApp()
    app.globalData.family = familyData
    wx.setStorageSync('family', familyData)
  }, family)
}

async function getRecordCards(page) {
  return await page.$$('record-card')
}

async function getHighlightedCards(page) {
  const cards = await getRecordCards(page)
  const highlighted = []
  for (const card of cards) {
    const data = await card.data().catch(() => ({}))
    if (data.highlight) highlighted.push(card)
  }
  return { cards, highlighted }
}

async function ensureFamily(mp) {
  // 在 join 页面，要么创建家庭要么输入邀请码加入
  // 简化：调用后端 API 直接 createFamily（如果已经有家就跳过）
  const cachedFamily = await mp.evaluate(async function () {
    const app = getApp()
    return app.globalData.family || wx.getStorageSync('family')
  })
  if (cachedFamily) return cachedFamily

  try {
    const me = await apiRequest(mp, 'GET', '/families/me')
    if (me && me.family) {
      await setFamilyCache(mp, me.family)
      return me.family
    }
  } catch (e) {}

  try {
    const created = await apiRequest(mp, 'POST', '/families', {
      data: { name: '自动化测试家' },
    })
    await setFamilyCache(mp, created.family)
    return created.family
  } catch (e) {
    return { error: String(e && (e.message || e.code || e)) }
  }
}

// ============================================================
// P0-1: AI 角标
// ============================================================
async function testAiTag(mp) {
  const TC = 'P0-1 · AI 录入卡片显示 AI 角标，普通卡片不显示'
  log(`\n=== ${TC} ===`)

  try {
    // 创建两条记录：一条 manual，一条 ai。然后回首页验角标
    const now = new Date()
    const manualRes = await apiRequest(mp, 'POST', '/records', {
      data: {
        value: 6.5,
        period: 'fasting',
        measured_at: now.toISOString(),
        source: 'manual',
        note: 'P0-1 manual',
      },
    })
    const aiRes = await apiRequest(mp, 'POST', '/records', {
      data: {
        value: 8.2,
        period: 'after_breakfast',
        measured_at: now.toISOString(),
        source: 'ai',
        note: 'P0-1 ai',
      },
    })
    const ids = {
      manualId: manualRes && (manualRes.id || (manualRes.record && manualRes.record.id)),
      aiId: aiRes && (aiRes.id || (aiRes.record && aiRes.record.id)),
      manualResp: manualRes,
      aiResp: aiRes,
    }
    log(`  manualId=${ids.manualId} aiId=${ids.aiId}`)
    log(`  ai 创建响应里 source=${ids.aiResp && ids.aiResp.source}`)

    // 跳转首页
    const home = await mp.reLaunch('/pages/index/index')
    await home.waitFor(2500)
    await safeShot(mp, 'p0-1-home.png')

    // 找所有 record-card 组件节点，再进入组件内部验证角标
    const cards = await getRecordCards(home)
    log(`  首页 record-card 数量: ${cards.length}`)

    let aiSourceCount = 0
    let aiTaggedCount = 0
    let nonAiTaggedCount = 0

    for (const card of cards) {
      const data = await card.data().catch(() => ({}))
      const aiTag = await card.$('.ai-tag')
      if (data.isAi) {
        aiSourceCount++
        if (aiTag) aiTaggedCount++
      } else if (aiTag) {
        nonAiTaggedCount++
      }
    }
    log(`  AI 源卡片数量: ${aiSourceCount}`)
    log(`  带 AI 角标卡片数量: ${aiTaggedCount}`)
    log(`  非 AI 误带角标数量: ${nonAiTaggedCount}`)

    if (aiTaggedCount === 0) {
      RESULTS.push(fail(TC, `首页没有渲染 .ai-tag。manual=${ids.manualId} ai=${ids.aiId}`))
      return
    }

    if (aiSourceCount >= 1 && aiTaggedCount === aiSourceCount && nonAiTaggedCount === 0) {
      RESULTS.push(pass(TC, `aiTag=${aiTaggedCount} cards=${cards.length}`))
    } else if (nonAiTaggedCount > 0) {
      RESULTS.push(fail(TC, `有 ${nonAiTaggedCount} 张非 AI 卡片误显示 AI 角标`))
    } else {
      RESULTS.push(fail(TC, `AI 源卡片 ${aiSourceCount}，仅 ${aiTaggedCount} 张显示角标`))
    }
  } catch (e) {
    RESULTS.push(fail(TC, `异常: ${e.message}`))
  }
}

// ============================================================
// P0-2: 新建记录高亮动画
// ============================================================
async function testHighlight(mp) {
  const TC = 'P0-2 · 新建记录后高亮卡片，2s 后高亮消失'
  log(`\n=== ${TC} ===`)

  try {
    // 直接通过 add 页面真实流程：导航到 /pages/add/add，触发 add 流程
    // 简化做法：API 创建一条记录拿到 id，然后 reLaunch 首页时通过 query 把 highlight id 传过去
    // 看 index.js 怎么接收高亮 id 的
    const now = new Date()
    const res = await apiRequest(mp, 'POST', '/records', {
      data: {
        value: 7.0,
        period: 'before_lunch',
        measured_at: now.toISOString(),
        source: 'manual',
        note: 'P0-2 highlight 测试',
      },
    })
    const newId = res && (res.id || (res.record && res.record.id))
    log(`  新记录 id=${newId}`)
    if (!newId) {
      RESULTS.push(fail(TC, `创建记录失败，没拿到 id`))
      return
    }

    // 与真实新增流程一致：新增页会写 pending_highlight_id，首页 onShow 消费它
    await mp.callWxMethod('setStorageSync', 'pending_highlight_id', newId)
    await mp.callWxMethod('reLaunch', { url: '/pages/index/index' })
    await sleep(400)
    const home = await mp.currentPage()
    await safeShot(mp, 'p0-2-home-with-highlight.png')

    // 验高亮卡片存在
    let highlightedT0 = []
    let cardsT0 = []
    const startedAt = Date.now()
    while (Date.now() - startedAt < 1100) {
      const state = await getHighlightedCards(home)
      cardsT0 = state.cards
      highlightedT0 = state.highlighted
      if (highlightedT0.length > 0) break
      await sleep(100)
    }
    log(`  T+0.5s record-card 数量: ${cardsT0.length}`)
    log(`  T+0.5s highlighted 数量: ${highlightedT0.length}`)

    if (highlightedT0.length === 0) {
      // 也许首页不接受 highlight query，要从 add 流回退。改试 navigateBack 流路径。
      RESULTS.push(
        fail(
          TC,
          `首页加载时没有 .record-card.highlight 节点。检查 pages/index/index.js 是否处理 highlight query`,
        ),
      )
      return
    }

    // 等 2.5s（高亮持续时间一般 ≤2s）后再查
    await home.waitFor(2500)
    const { highlighted: highlightedT3 } = await getHighlightedCards(home)
    log(`  T+3s highlighted 数量: ${highlightedT3.length}`)
    await safeShot(mp, 'p0-2-home-after-highlight.png')

    if (highlightedT0.length >= 1 && highlightedT3.length === 0) {
      RESULTS.push(pass(TC, `初始高亮 ${highlightedT0.length}，3s 后归零`))
    } else if (highlightedT3.length > 0) {
      RESULTS.push(
        fail(
          TC,
          `高亮没在 3s 内消失（仍有 ${highlightedT3.length} 个 .record-card.highlight）`,
        ),
      )
    } else {
      RESULTS.push(fail(TC, `异常态: T0=${highlightedT0.length} T3=${highlightedT3.length}`))
    }
  } catch (e) {
    RESULTS.push(fail(TC, `异常: ${e.message}`))
  }
}

// ============================================================
// P0-3: 家庭成员 joined_at 渲染
// ============================================================
async function testJoinedAt(mp) {
  const TC = 'P0-3 · 家庭管理页成员 joined_at 渲染为「加入于 YYYY-MM-DD」'
  log(`\n=== ${TC} ===`)

  try {
    // 先用 API 拿原始数据看 joined_at 字符串
    const familyData = await apiRequest(mp, 'GET', '/families/me')
    const rawMembers = familyData && familyData.members

    if (!rawMembers || rawMembers.length === 0) {
      RESULTS.push(fail(TC, `getFamily 返空 members 列表`))
      return
    }
    log(`  members 数量: ${rawMembers.length}`)
    for (const m of rawMembers) {
      log(`  - ${m.nickname || '(空)'} joined_at=${m.joined_at} type=${typeof m.joined_at}`)
    }

    // 检查 joined_at 是否是 ISO 字符串
    const allIso = rawMembers.every((m) => typeof m.joined_at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(m.joined_at))
    if (!allIso) {
      RESULTS.push(
        fail(
          TC,
          `joined_at 字段不是 ISO 字符串：${rawMembers.map((m) => `${typeof m.joined_at}=${m.joined_at}`).join(', ')}`,
        ),
      )
      return
    }

    // 跳到 family 页面
    const family = await mp.reLaunch('/pages/family/family')
    await family.waitFor(1500)
    await safeShot(mp, 'p0-3-family.png')

    // 抓 .joined 文本
    const joinedNodes = await family.$$('.joined')
    log(`  .joined 节点数量: ${joinedNodes.length}`)
    if (joinedNodes.length === 0) {
      RESULTS.push(fail(TC, `family 页面没有渲染 .joined 节点`))
      return
    }

    let okCount = 0
    let firstBadText = null
    for (const node of joinedNodes) {
      const text = (await node.text().catch(() => '')) || ''
      log(`  joined 文本: "${text}"`)
      if (/^加入于 \d{4}-\d{2}-\d{2}/.test(text.trim())) {
        okCount++
      } else if (!firstBadText) {
        firstBadText = text
      }
    }

    if (okCount === joinedNodes.length) {
      RESULTS.push(pass(TC, `${okCount}/${joinedNodes.length} 节点格式正确`))
    } else {
      RESULTS.push(
        fail(
          TC,
          `仅 ${okCount}/${joinedNodes.length} 节点匹配 "加入于 YYYY-MM-DD" 格式，第一个不匹配的：「${firstBadText}」`,
        ),
      )
    }
  } catch (e) {
    RESULTS.push(fail(TC, `异常: ${e.message}`))
  }
}

// ============================================================
// 主流程
// ============================================================
;(async () => {
  ensureDirs()
  let mp
  let shouldCloseDevTools = false
  log('启动 miniprogram-automator...')
  log(`  CLI: ${CLI_PATH}`)
  log(`  PROJECT: ${PROJECT_PATH}`)
  try {
    const session = await createMiniProgramSession()
    mp = session.mp
    shouldCloseDevTools = session.shouldCloseDevTools
    log(`  MODE: ${session.mode}`)
  } catch (e) {
    log(`❌ 自动化连接失败: ${e.message}`)
    log('  常见原因：')
    log('    1. 微信开发者工具未开启服务端口（设置→安全→服务端口）')
    log('    2. CLI 路径不对（可改 helpers.js 里 CLI_PATH）')
    log('    3. 工具版本太老')
    RESULTS.push(fail('automator.launch', e.message))
    writeReport(RESULTS)
    process.exit(1)
  }

  try {
    log('清理登录态 + 等待初始化...')
    await setupSession(mp)
    await sleep(800)

    log('确保家庭存在...')
    const family = await ensureFamily(mp)
    log(`  family: ${JSON.stringify(family).slice(0, 200)}`)

    if (family && family.error) {
      RESULTS.push(fail('环境前置 · 创建/获取家庭', family.error))
    } else {
      await testAiTag(mp)
      await testHighlight(mp)
      await testJoinedAt(mp)
    }
  } catch (e) {
    log(`❌ 主流程异常: ${e.stack || e.message}`)
    RESULTS.push(fail('主流程', e.message))
  } finally {
    try {
      if (shouldCloseDevTools) {
        await mp.close()
      } else {
        mp.disconnect()
      }
    } catch (e) {}

    const summary = writeReport(RESULTS)
    log(`\n=== 汇总 ===`)
    log(`总数: ${summary.total}  通过: ${summary.pass}  失败: ${summary.fail}  跳过: ${summary.skip}`)
    log(`详情: tests/automation/results/p0-results.json`)
    process.exit(summary.fail > 0 ? 1 : 0)
  }
})()
