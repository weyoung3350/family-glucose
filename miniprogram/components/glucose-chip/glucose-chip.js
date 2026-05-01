const { colorOf, textColorOf } = require('../../utils/color.js')

Component({
  properties: {
    level: String,
    label: String,
  },
  observers: {
    level(level) {
      this.setData({ color: colorOf(level), textColor: textColorOf(level) })
    },
  },
})
