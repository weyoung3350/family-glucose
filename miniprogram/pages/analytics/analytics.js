const { api } = require('../../utils/api.js')
const { periods, shortLabel } = require('../../utils/period.js')
const { daysAgo, dateOnly } = require('../../utils/time.js')

const gradeLevels = [
  { key: 'low', label: '偏低', color: '#4DA3FF' },
  { key: 'ideal', label: '理想', color: '#52C41A' },
  { key: 'ok', label: '一般', color: '#FAAD14' },
  { key: 'high', label: '偏高', color: '#FA8C16' },
  { key: 'vhigh', label: '过高', color: '#F5222D' },
]

Page({
  data: {
    tab: 'matrix',
    periods: periods.map((p) => ({ ...p, short: shortLabel(p.key) })),
    rangeDays: { matrix: 7, chart: 30, report: 30 },
    matrix: [],
    chart: null,
    report: null,
    chartFilter: 'all',
    distributionRows: [],
  },
  onShow() { this.loadCurrent() },
  switchTab(event) {
    this.setData({ tab: event.currentTarget.dataset.tab })
    this.loadCurrent()
  },
  rangeQuery(days) {
    return { from: daysAgo(days), to: dateOnly(new Date()) }
  },
  async loadCurrent() {
    if (this.data.tab === 'matrix') return this.loadMatrix()
    if (this.data.tab === 'chart') return this.loadChart()
    return this.loadReport()
  },
  async loadMatrix() {
    const res = await api.matrix(this.rangeQuery(this.data.rangeDays.matrix))
    const matrix = res.days.map((day) => ({
      ...day,
      cellsList: this.data.periods.map((period) => ({
        key: period.key,
        cell: day.cells[period.key],
      })),
    }))
    this.setData({ matrix })
  },
  async loadChart() {
    const query = this.rangeQuery(this.data.rangeDays.chart)
    if (this.data.chartFilter === 'fasting') query.period = 'fasting'
    const res = await api.chart(query)
    let points = res.points
    if (this.data.chartFilter === 'after') points = points.filter((p) => p.period.indexOf('after_') === 0)
    const stats = this.data.chartFilter === 'after' ? this.buildStats(points) : res.stats
    this.setData({
      chart: { ...res, points, stats },
      distributionRows: this.buildDistributionRows(stats),
    }, () => this.drawTrend())
  },
  buildStats(points) {
    const values = points.map((p) => Number(p.value))
    const distribution = gradeLevels.reduce((acc, item) => {
      acc[item.key] = 0
      return acc
    }, {})
    points.forEach((point) => {
      distribution[point.status.level] = (distribution[point.status.level] || 0) + 1
    })
    const sum = values.reduce((acc, value) => acc + value, 0)
    return {
      count: points.length,
      avg: values.length ? Math.round((sum / values.length) * 10) / 10 : null,
      max: values.length ? Math.max(...values) : null,
      min: values.length ? Math.min(...values) : null,
      distribution,
    }
  },
  buildDistributionRows(stats) {
    const count = stats.count || 0
    return gradeLevels.map((item) => {
      const value = stats.distribution[item.key] || 0
      return {
        ...item,
        count: value,
        width: count ? Math.round((value / count) * 1000) / 10 : 0,
      }
    })
  },
  drawTrend() {
    const points = (this.data.chart && this.data.chart.points) || []
    wx.nextTick(() => {
      const query = wx.createSelectorQuery().in(this)
      query.select('#trendCanvas').fields({ node: true, size: true }).exec((res) => {
        const canvasInfo = res && res[0]
        if (!canvasInfo || !canvasInfo.node) return
        const canvas = canvasInfo.node
        const ctx = canvas.getContext('2d')
        const dpr = (wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 1) || 1
        const width = canvasInfo.width
        const height = canvasInfo.height
        canvas.width = width * dpr
        canvas.height = height * dpr
        ctx.scale(dpr, dpr)
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = '#FFF8EF'
        ctx.fillRect(0, 0, width, height)
        ctx.fillStyle = 'rgba(82, 196, 26, 0.12)'
        ctx.fillRect(24, height * 0.35, width - 40, height * 0.22)
        ctx.strokeStyle = '#E5E6EB'
        ctx.lineWidth = 1
        for (let i = 0; i < 4; i += 1) {
          const y = 24 + i * ((height - 56) / 3)
          ctx.beginPath()
          ctx.moveTo(24, y)
          ctx.lineTo(width - 16, y)
          ctx.stroke()
        }
        if (!points.length) return
        const values = points.map((point) => Number(point.value))
        const min = Math.min(3, ...values)
        const max = Math.max(14, ...values)
        const span = max - min || 1
        const left = 30
        const right = 18
        const top = 24
        const bottom = 32
        const coordinates = points.map((point, index) => ({
          x: left + (points.length === 1 ? 0 : index * ((width - left - right) / (points.length - 1))),
          y: top + ((max - Number(point.value)) / span) * (height - top - bottom),
          color: point.status.color,
        }))
        ctx.strokeStyle = '#FF9F40'
        ctx.lineWidth = 3
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.beginPath()
        coordinates.forEach((point, index) => {
          if (index === 0) ctx.moveTo(point.x, point.y)
          else ctx.lineTo(point.x, point.y)
        })
        ctx.stroke()
        coordinates.forEach((point) => {
          ctx.beginPath()
          ctx.fillStyle = point.color
          ctx.arc(point.x, point.y, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.strokeStyle = '#FFFFFF'
          ctx.lineWidth = 2
          ctx.stroke()
        })
      })
    })
  },
  async loadReport() {
    const res = await api.report(this.rangeQuery(this.data.rangeDays.report))
    this.setData({ report: res })
  },
  onCellTap(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },
  setChartFilter(event) {
    this.setData({ chartFilter: event.currentTarget.dataset.filter })
    this.loadChart()
  },
})
