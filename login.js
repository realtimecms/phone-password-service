const rtcms = require("realtime-cms")
const definition = require("./definition.js")

const {User, PhonePassword, PhoneCode} = require("./model.js")

const passwordHash = require("./passwordHash.js")

definition.action({
  name: "login",
  properties: {
    phone: { type: String },
    passwordHash: { type: String, preFilter: passwordHash }
  },
  async execute({ phone, passwordHash }, {service, client}, emit) {
    let registerCodePromise = PhoneCode.run(PhoneCode.table
      .filter({ action: 'register',  used: false, phone })
      .filter(r=>r("expire").gt(Date.now())))
        .then(cursor => {
          if(!cursor) return [];
          return cursor.toArray().then( arr => arr[0] );
        })
    let phonePasswordPromise = PhonePassword.get(phone)
    let [registerCodeRow, phonePasswordRow] = await Promise.all([registerCodePromise, phonePasswordPromise])
    if(!phonePasswordRow && registerCodeRow) throw service.error("registrationNotConfirmed")
    if (!phonePasswordRow) throw { properties: { phone: "notFound" }}
    if(phonePasswordRow.passwordHash != passwordHash) throw { properties: { passwordHash: "wrongPassword" }}
    let userRow = await User.get(phonePasswordRow.user)
    if(!userRow) throw service.error("internalServerError")
    emit("session", [{
      type: "loggedIn",
      user: phonePasswordRow.user,
      session: client.sessionId,
      expire: null,
      roles: userRow.roles || []
    }])
  }
})
