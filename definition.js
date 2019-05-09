const rtcms = require("realtime-cms")

const definition = rtcms.createServiceDefinition({
  name: "phonePassword",
  eventSourcing: true
})

module.exports = definition