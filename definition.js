const rtcms = require("realtime-cms")
const validators = require("../validation")

const definition = rtcms.createServiceDefinition({
  name: "phonePassword",
  eventSourcing: true,
  validators
})

module.exports = definition