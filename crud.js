const rtcms = require("realtime-cms")
const definition = require("./definition.js")

const {User, PhonePassword} = require("./model.js")

definition.action({
  name: "PhonePasswordUserCreate", // create user with phonePassword
  properties: {
    phone: PhonePassword.properties.phone,
    passwordHash: PhonePassword.properties.passwordHash
  },
  returns: {
    type: PhonePassword,
    idOnly: true
  },
  async execute({ phone, passwordHash }, context, emit) {
    const phoneRow = await PhonePassword.get(phone)
    if(phoneRow) throw new Error("alreadyAdded")
    let user = rtcms.generateUid()
    emit([{
      type: "PhonePasswordCreated",
      phonePassword: phone,
      data: {
        phone, passwordHash, user
      }
    }])
    emit("users", [{
      type: "UserCreated",
      user
    },{
      type: "loginMethodAdded",
      user,
      method: {
        type: "phonePassword",
        id: phone,
        phone
      }
    }])
    return user
  }
})

definition.action({
  name: "PhonePasswordCreate", // override CRUD operation
  properties: {
    ...PhonePassword.properties,
    user: {
      type: User,
      idOnly: true
    }
  },
  returns: {
    type: PhonePassword,
    idOnly: true
  },
  async execute({ phone, passwordHash, user }, context, emit) {
    const phoneRow = await PhonePassword.get(phone)
    const userRow = await User.get(user)
    if(phoneRow) throw new Error("alreadyAdded")
    if(!userRow) throw new Error("userNotFound")
    emit([{
      type: "PhonePasswordCreated",
      phonePassword: phone,
      data: {
        phone, passwordHash, user
      }
    }])
    emit("users", [{
      type: "loginMethodAdded",
      user,
      method: {
        type: "phonePassword",
        id: phone,
        phone
      }
    }])
    return phone
  }
})

definition.action({
  name: "PhonePasswordUpdate", // override CRUD operation
  properties: {
    phonePassword: {
      type: PhonePassword,
      idOnly: true
    },
    passwordHash: PhonePassword.properties.passwordHash
  },
  returns: {
    type: PhonePassword,
    idOnly: true
  },
  async execute({ phonePassword, passwordHash }, {client, service}, emit) {
    const phoneRow = await PhonePassword.get(phonePassword)
    if(!phoneRow) throw new Error("notFound")
    service.trigger({
      type: "OnPasswordChange",
      user: phoneRow.user,
      passwordHash: passwordHash
    })
    return phoneRow.id
  }
})

definition.action({
  name: "PhonePasswordDelete", // override CRUD operation
  properties: {
    phonePassword: {
      type: PhonePassword,
      idOnly: true
    },
    passwordHash: PhonePassword.properties.passwordHash
  },
  returns: {
    type: PhonePassword,
    idOnly: true
  },
  async execute({ phonePassword }, context, emit) {
    const phoneRow = await PhonePassword.get(phonePassword)
    if(!phoneRow) throw new Error("notFound")
    console.log("PHONE ROW", phoneRow)
    const userRow = await User.get(phoneRow.user)
    if(!userRow) throw new Error("userNotFound")
    emit([{
      type: "PhonePasswordDeleted",
      phonePassword
    }])
    emit("users", [{
      type: "loginMethodRemoved",
      user: phoneRow.user,
      method: {
        type: "phonePassword",
        id: phonePassword,
        phone: phonePassword
      }
    }])
    return phonePassword
  }
})

definition.event({
  name: "UserDeleted",
  properties: {
    user: {
      type: User,
      idOnly: true
    }
  },
  async execute({ user }) {
    await PhonePassword.run(PhonePassword.table.filter({ user }).delete())
  }
})

definition.trigger({
  name: "OnUserDelete",
  properties: {
    user: {
      type: User,
      idOnly: true
    }
  },
  async execute({ user }, context, emit) {
    emit([{
      type: "UserDeleted",
      user
    }])
  }
})
