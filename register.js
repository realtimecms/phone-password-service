const crypto = require('crypto')

const rtcms = require("realtime-cms")
const definition = require("./definition.js")

const {User, PhonePassword, PhoneCode} = require("./model.js")

const passwordHash = require('../config/passwordHash.js')
const randomCode = require('../config/randomCode.js')
const userData = require('../config/userData.js')

require('../../i18n/ejs-require.js')
const i18n = require('../../i18n')

definition.event({
  name: "codeGenerated",
  async execute(data) {
    PhoneCode.create({
      ...data,
      id: data.phone + "_" + data.code
    })
    /// TODO: cancel previous keys for this phone number!?!
  }
})

definition.action({
  name: "startRegister",
  properties: {
    phone: { type: String },
    passwordHash: { type: String, preFilter: passwordHash },
    userData
  },
  async execute({ phone, passwordHash, userData }, {service}, emit) {
    let phonePasswordPromise = PhonePassword.get(phone)
    let registerKeysPromise = PhoneCode.run(PhoneCode.table
        .filter({ action: 'register',  used: false, phone })
        .filter(r=>r("expire").gt(Date.now()))
    ).then(cursor => {
          if(!cursor) return []
          return cursor.toArray()
        })
    let randomCodePromise = randomCode(phone)
    const [phoneRow, registerKeys, code] =
        await Promise.all([phonePasswordPromise, registerKeysPromise, randomCodePromise])
    if(phoneRow) throw service.error("alreadyAdded")
    //console.log("HOW?!!", phone, phoneRow)
    if(registerKeys.length>0) throw service.error("registrationNotConfirmed")
    const user = rtcms.generateUid()
    emit("phonePassword", [{
      type: 'codeGenerated',
      action: 'register',
      code,
      user,
      phone, passwordHash, userData,
      expire: Date.now() + (10 * 60 * 1000) // 10 minutes
    }])
    emit("sms", [{
      type: "sent",
      phone,
      text: i18n().phonePassword.registerSms({ code, phone, userData })
    }])
  }
})

definition.event({
  name: "codeProlonged",
  async execute({ code, phone, expire }) {
    PhoneCode.update(phone + "_" + code, { expire })
  }
})

definition.action({
  name: "resendRegisterCode",
  properties: {
    phone: { type: String }
  },
  async execute({phone}, {service}, emit) {
    let registerKey = await PhoneCode.run(PhoneCode.table
        .filter({ action: 'register',  used: false, phone })
        .filter(r => r("expire").gt(Date.now()))
    ).then(cursor => {
      if(!cursor) return [];
      return cursor.toArray().then( arr => arr[0] );
    })
    if(!registerKey) throw new evs.error("notFound")
    emit("phonePassword", [{ /// Generation of new code will be safer?
      type: 'codeProlonged',
      phone,
      code: registerKey.code,
      expire: Date.now() + (10 * 60 * 60 * 1000)
    }])
    emit("sms", [{
      type: "sent",
      phone,
      text: i18n().phonePassword.registerSms({ code: registerKey.code, phone, userData: registerKey.userData})
    }])
  }
})

definition.event({
  name: "codeUsed",
  async execute({ code, phone }) {
    PhoneCode.update(phone + "_" + code, { used: true })
  }
})

definition.action({
  name: "finishRegister",
  properties: {
    code: { type: String },
    phone: { type: String }
    //sessionId: { type: String } - from clientData
  },
  async execute({ phone, code }, {service, client}, emit) {
    const key = phone + "_" + code
    let registerKeyRow = await PhoneCode.get(key)
    if(!registerKeyRow) throw { properties: { code: 'notFound' }}
    if(registerKeyRow.expire < Date.now()) throw service.error('expired')
    if(registerKeyRow.used) throw service.error('used')
    let phoneRow = await PhonePassword.get(registerKeyRow.phone)
    if(phoneRow) throw evs.error('alreadyAdded')
    let {user, dbPhone, passwordHash, userData} = registerKeyRow
    userData.phone = phone
    emit("phonePassword", [{
      type: "codeUsed",
      key
    }, {
      type: "PhonePasswordCreated",
      phonePassword: phone,
      data: {
        user, phone, passwordHash
      }
    }])
    emit("users", [{
      type: "UserCreated",
      user,
      data: {
        userData
      }
    },{
      type: "loginMethodAdded",
      user,
      method: {
        type: "phonePassword",
        id: phone,
        phone
      }
    }])
    if(client && client.sessionId) emit("session", [{
      type: "loggedIn",
      user,
      session: client.sessionId,
      expire: null,
      roles: []
    }])
    return user
  }
})
