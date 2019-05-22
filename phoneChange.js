const crypto = require('crypto')
const rtcms = require("realtime-cms")
const definition = require("./definition.js")

const {User, PhonePassword, PhoneCode} = require("./model.js")

const passwordHash = require('../config/passwordHash.js')
const randomCode = require('../config/randomCode.js')

require('../../i18n/ejs-require.js')
const i18n = require('../../i18n')

definition.action({
  name: "startPhoneChange",
  properties: {
    newPhone: PhonePassword.properties.phone,
    passwordHash: PhonePassword.properties.passwordHash
  },
  async execute({ newPhone, passwordHash }, {client, service}, emit) {
    if(!client.user) throw new Error("notAuthorized")
    const user = client.user
    let oldPhonePromise = PhonePassword.run(PhonePassword.table.filter({ user }).nth(0))
    let newPhonePromise = PhonePassword.get(newPhone)
    let randomCodePromise = randomCode(newPhone)
    let userPromise = User.get(user)
    let [oldPhoneRow, newPhoneRow, code, userRow] =
        await Promise.all([oldPhonePromise, newPhonePromise, randomCodePromise, userPromise])
    if(!oldPhoneRow) throw service.error('notFound')
    if(newPhoneRow) throw service.error('taken')
    if(oldPhoneRow.user != user) throw service.error('notAuthorized')
    if(oldPhoneRow.passwordHash != passwordHash) throw service.error('wrongPassword')
    let oldPhone = oldPhoneRow.phone
    emit("phonePassword", [{
      type: 'codeGenerated',
      action: 'phoneChange',
      oldPhone, newPhone, user,
      phone: newPhone,
      code,
      expire: Date.now() + (24 * 60 * 60 * 1000)
    }])
    emit("sms", [{
      type: "sent",
      phone: newPhone,
      text: i18n().phonePassword.changePhoneSms({oldPhone, newPhone, code, user: userRow})
    }])
  }
})

definition.action({
  name: "finishPhoneChange",
  properties: {
    newPhone: PhonePassword.properties.phone,
    code: PhonePassword.properties.passwordHash
  },
  async execute({ newPhone, code }, {client, service}, emit) {
    const key = newPhone + "_" + code
    let phoneKey = await PhoneCode.get(key)
    if(!phoneKey) throw service.error('notFound')
    if(phoneKey.action != 'phoneChange') throw service.error('notFound')
    if(phoneKey.used) throw service.error('used')
    if(phoneKey.expire < Date.now()) throw service.error('expired')
    let oldPhonePromise = PhonePassword.get(phoneKey.oldPhone)
    let newPhonePromise = PhonePassword.get(phoneKey.newPhone)
    let [oldPhoneRow, newPhoneRow] = await Promise.all([oldPhonePromise, newPhonePromise])
    if(newPhoneRow) throw service.error('taken')
    if(!oldPhoneRow) throw service.error('notFound')
    emit('phonePassword', [{
      type: 'PhonePasswordCreated',
      phonePassword: phoneKey.newPhone,
      data: {
        phone: phoneKey.newPhone,
        user: phoneKey.user,
        passwordHash: oldPhoneRow.passwordHash
      }
    },{
      type: 'PhonePasswordDeleted',
      phonePassword: phoneKey.oldPhone
    },{
      type: "codeUsed",
      phone: newPhone, code
    }])
    emit("user", [{
      type: "loginMethodAdded",
      user: phoneKey.user,
      method: {
        type: "phonePassword",
        id: phoneKey.newPhone,
        phone: phoneKey.newPhone
      }
    }, {
      type: "loginMethodRemoved",
      user: phoneKey.user,
      method: {
        type: "phonePassword",
        id: phoneKey.oldPhone,
        phone: phoneKey.oldPhone
      }
    }])
  }
})
