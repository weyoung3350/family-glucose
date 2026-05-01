const { timeLabel } = require('../../utils/time.js')

Component({
  properties: {
    record: Object,
    highlight: Boolean,
  },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.record.id })
    },
  },
  observers: {
    record(record) {
      if (!record) return
      const nickname = record.recorder && record.recorder.nickname ? record.recorder.nickname : '家人'
      this.setData({
        displayTime: timeLabel(record.measured_at),
        avatarText: nickname.slice(0, 1) || '我',
        recorderText: `${nickname}记`,
        noteText: record.note ? record.note.slice(0, 20) : '',
        isAi: record.source === 'ai',
      })
    },
  },
})
