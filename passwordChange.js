const crypto = require('crypto')
const rtcms = require("realtime-cms")
const definition = require("./definition.js")

require('../../i18n/ejs-require.js')
const i18n = require('../../i18n')

const {User, PhonePassword, PhoneCode} = require("./model.js")

const passwordHash = require("../config/passwordHash.js")
const randomCode = require("../config/randomCode.js")

definition.action({
  name: "updatePasswordByUser",
  properties: {
    user: { type: User, idOnly: true },
    phone: PhonePassword.properties.phone,
    oldPasswordHash: PhonePassword.properties.passwordHash,
    newPasswordHash: PhonePassword.properties.passwordHash
  },
  async execute({ user, phone, oldPasswordHash, newPasswordHash }, { service, client }, emit) {
    let row = await PhonePassword.get(phone)
    if (!row) throw service.error("notFound")
    if (row.user != user) throw service.error("notAuthorized")
    if(row.passwordHash != oldPasswordHash) throw service.error("wrongPassword")
    service.trigger({
      type: "OnPasswordChange",
      user,
      passwordHash: newPasswordHash
    })
  }
})

definition.action({
  name: "updateAllPasswordsByUser",
  properties: {
    user: { type: User, idOnly: true },
    phone: PhonePassword.properties.phone,
    oldPasswordHash: PhonePassword.properties.passwordHash,
    newPasswordHash: PhonePassword.properties.passwordHash
  },
  async execute({ user, oldPasswordHash, newPasswordHash }, { service, client}, emit) {
    let cursor = await PhonePassword.run(PhonePassword.table.filter({user}))
    if(!cursor) service.error("notFound")
    let results = await cursor.toArray()
    if(results.length == 0) throw service.error("notFound")
    for(let row of results) {
      if (row.user != user) throw service.error("notAuthorized")
      if (row.passwordHash != oldPasswordHash) throw service.error("wrongPassword")
    }
    service.trigger({
      type: "OnPasswordChange",
      user,
      passwordHash: newPasswordHash
    })
  }
})

definition.action({
  name: "startPasswordReset",
  properties: {
    phone: PhonePassword.properties.phone
  },
  async execute({ phone }, { service, client}, emit) {
    let userPromise = PhonePassword.run(PhonePassword.table.get(phone).do(
        e => User.table.get(e('user'))
    ))
    let randomCodePromise = randomCode(phone)
    let [user, code] = await Promise.all([userPromise, randomCodePromise])
    emit("phonePassword", [{
      type: 'codeGenerated',
      action: 'resetPassword',
      phone, user: user.id, code,
      expire: Date.now() + (24 * 60 * 60 * 1000)
    }])
    emit("sms", [{
      type: "sent",
      phone,
      text: i18n().phonePassword.resetPasswordSms({phone, code, user})
    }])
  }
})

definition.action({
  name: "finishPasswordReset",
  properties: {
    phone: PhonePassword.properties.phone,
    code: PhoneCode.properties.code,
    newPasswordHash: PhonePassword.properties.passwordHash
  },
  async execute({ phone, code, newPasswordHash }, { service, client}, emit) {
    const key = phone+"_"+code
    let phoneCode = await PhoneCode.get(key)
    if(!phoneCode) throw service.error('notFound')
    if(phoneCode.action != 'resetPassword') throw service.error('notFound')
    if(phoneCode.used) throw service.error('used')
    if(phoneCode.expire < Date.now()) throw service.error('expired')
    let passwordHash = newPasswordHash
    let phoneRow = await PhonePassword.get(phoneCode.phone)
    if(!phoneRow) throw service.error('notFound')
    emit("phonePassword", [{
      type: "codeUsed",
      phone, code
    }, {
      type: "PhonePasswordUpdated",
      phonePassword: phoneCode.phone,
      data: {
        passwordHash
      }
    }])
  }
})

definition.event({
  name: "userPasswordChanged",
  properties: {
    user: {
      type: User,
      idOnly: true
    }
  },
  async execute({ user, passwordHash }) {
    let cursor = await PhonePassword.run(PhonePassword.table.filter({user}))
    if(!cursor) service.error("notFound")
    let results = await cursor.toArray()
    if(results.length == 0) throw service.error("notFound")
    for(let row of results) {
      PhonePassword.update(row.phone, { passwordHash })
    }
  }
})

definition.trigger({
  name: "OnPasswordChange",
  properties: {
    user: {
      type: User,
      idOnly: true
    },
    passwordHash: {
      type: String
    }
  },
  async execute({ user, passwordHash }, context, emit) {
    emit([{
      type: "userPasswordChanged",
      user,
      passwordHash
    }])
  }
})
