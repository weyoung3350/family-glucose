const QUEUE_KEY = 'offline_record_queue'

function enqueue(payload) {
  const queue = wx.getStorageSync(QUEUE_KEY) || []
  queue.push({ ts: Date.now(), payload })
  wx.setStorageSync(QUEUE_KEY, queue)
}

function dequeue() {
  return wx.getStorageSync(QUEUE_KEY) || []
}

function clear() {
  wx.removeStorageSync(QUEUE_KEY)
}

function queueSize() {
  return dequeue().length
}

async function flush(api) {
  const queue = dequeue()
  if (!queue.length) return { ok: 0, failed: 0 }
  const results = { ok: 0, failed: 0 }
  const remaining = []
  for (const item of queue) {
    try {
      await api.createRecord(item.payload)
      results.ok++
    } catch (e) {
      results.failed++
      remaining.push(item)
    }
  }
  wx.setStorageSync(QUEUE_KEY, remaining)
  return results
}

module.exports = { enqueue, dequeue, clear, queueSize, flush }
