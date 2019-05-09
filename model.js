const rtcms = require("realtime-cms")
const definition = require("./definition.js")

const User = definition.foreignModel("users", "User")

const PhonePassword = definition.model({
  name: "PhonePassword",
  /// TODO: add queued by phone
  properties: {
    phone: {
      type: String
    },
    passwordHash: {
      type: String
    },
    user: {
      type: User
    }
  },
  crud: {}
})

const PhoneCode = definition.model({
  name: "PhoneCode",
  properties: {
    action: { type: String },
    used: { type: Boolean, defaultValue: false },
    phone: { type: String },
    code: { type: String },
    expire: { type: Number }
  }
})

module.exports = {
  User, PhonePassword, PhoneCode
}