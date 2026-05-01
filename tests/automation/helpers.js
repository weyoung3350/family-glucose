// 自动化测试辅助函数
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const PROJECT_PATH = path.join(ROOT, 'miniprogram')
const RESULTS_DIR = path.join(__dirname, 'results')
const SCREENSHOT_DIR = path.join(RESULTS_DIR, 'screenshots')

// macOS 默认安装路径
const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'

function ensureDirs() {
  for (const dir of [RESULTS_DIR, SCREENSHOT_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }
}

function log(msg) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  console.log(`[${ts}] ${msg}`)
}

function pass(name, detail = '') {
  log(`✅ PASS · ${name}${detail ? ` · ${detail}` : ''}`)
  return { name, status: 'pass', detail, ts: Date.now() }
}

function fail(name, reason) {
  log(`❌ FAIL · ${name} · ${reason}`)
  return { name, status: 'fail', detail: reason, ts: Date.now() }
}

function skip(name, reason) {
  log(`⊘ SKIP · ${name} · ${reason}`)
  return { name, status: 'skip', detail: reason, ts: Date.now() }
}

async function safeShot(page, fileName) {
  try {
    const fullPath = path.join(SCREENSHOT_DIR, fileName)
    await page.screenshot({ path: fullPath, fullPage: true })
    return path.relative(ROOT, fullPath)
  } catch (e) {
    log(`  (截图失败: ${e.message})`)
    return null
  }
}

function writeReport(records) {
  const summary = {
    runAt: new Date().toISOString(),
    total: records.length,
    pass: records.filter((r) => r.status === 'pass').length,
    fail: records.filter((r) => r.status === 'fail').length,
    skip: records.filter((r) => r.status === 'skip').length,
    cases: records,
  }
  fs.writeFileSync(
    path.join(RESULTS_DIR, 'p0-results.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )
  return summary
}

module.exports = {
  ROOT,
  PROJECT_PATH,
  RESULTS_DIR,
  SCREENSHOT_DIR,
  CLI_PATH,
  ensureDirs,
  log,
  pass,
  fail,
  skip,
  safeShot,
  writeReport,
}
