const test = require('blue-tape')
const r = require('rethinkdb')
const testUtils = require('rethink-event-sourcing/tape-test-utils.js')
const crypto = require('crypto')

const admin = {
  roles: ["admin"]
}

test('User operations - Register, login, logout, reset password, change phone...', t => {
  t.plan(13)

  let conn

  testUtils.connectToDatabase(t, r, (connection) => conn = connection)

  let sessionId = crypto.randomBytes(24).toString('hex')
  let passwordHash = crypto.randomBytes(12).toString('hex')
  let phone = ""+(Math.random() * 1000000).toFixed()
  let firstName = crypto.randomBytes(12).toString('hex')
  let lastName = crypto.randomBytes(12).toString('hex')
  let userData = { firstName, lastName }
  let userId
  let commandId
  let registerCode

  t.test("Start sign-up", t => {
    t.plan(3)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'startRegister',
      parameters: { phone, passwordHash, userData }
    }, (cId) => { commandId = cId }).then(result => {})

    t.test('Check if there are events generated', t => {
      t.plan(4)

      setTimeout(() => {
        testUtils.getGeneratedEvents(r, 'phonePassword', commandId,
          (events) => {
            t.equal(events.length, 1, "generated one event in phonePassword list")
            if (events[0].code && events[0].phone) {
              registerCode = events[0].code
              t.pass('found code and phone in event')
            } else t.fail('code not found')
            if (events[0].user) {
              userId = events[0].user
              t.pass('found userId in event')
            } else t.fail('userId not found')
          }
        )

        testUtils.getGeneratedEvents(r, 'sms', commandId,
          (events) => {
            t.equal(events.length, 1, "generated sms event in sms list")
          }
        )
      }, 350)
    })

    t.test('Check if there are registerCode', t => {
      t.plan(1)
      setTimeout(() => {
        r.table('phonePassword_PhoneCode').get(phone + "_" + registerCode).run(conn).then(
          row => {
            if(row && row.phone == phone && row.code == registerCode) {
              t.pass("register code found")
            } else t.fail("register code not found")
          }
        )
      }, 450)
    })

  })

  t.test("resend sign-up code", t => {
    t.plan(2)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'resendRegisterCode',
      parameters: { phone }
    }, (cId) => { commandId = cId }).then(result => {})

    setTimeout(()=>{
      testUtils.getGeneratedEvents(r, 'sms', commandId,
        (events) => {
          t.equal(events.length, 1, "generated sms event in sms list")
        }
      )
    }, 550)
  })

  t.test("finish sign-up using phone code", t => {
    t.plan(5)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'finishRegister',
      parameters: { code: registerCode, phone: phone }
    }, (cId) => { commandId = cId }).then(result => {})

    t.test('Check if there are events generated', t => {
      t.plan(2)

      setTimeout(() => {
        testUtils.getGeneratedEvents(r, 'phonePassword', commandId,
          (events) => t.equal(events.length, 2, "generated two events in phonePassword list"))

        testUtils.getGeneratedEvents(r, 'users', commandId,
          (events) => t.equal(events.length, 2, "generated two events in user list"))
      }, 150)
    })

    t.test('Check if there are phonePassword entry', t => {
      t.plan(1)
      r.table("phonePassword_PhonePassword").get(phone).run(conn).then(
        row => {
          if (row) t.pass("phone found " + JSON.stringify(row))
          else t.fail("phone not found " + phone)
        }
      ).catch(
        error => t.fail("error " + error)
      )
    })

    t.test('Check if there are user entry', t => {
      t.plan(1)
      r.table("users_User").get(userId).run(conn).then(
        row => {
          if (row) t.pass("user found " + JSON.stringify(row))
          else t.fail("user not found " + userId)
        }
      ).catch(
        error => t.fail("error " + error)
      )
    })

    t.test('Check if the user has login method', t => {
      t.plan(4)
      r.table("users_User").get(userId).run(conn).then(
        user => {
          t.equal(user.loginMethods.length, 1, "user has one login method")
          t.equal(user.loginMethods[0].type, 'phonePassword', "login method type match")
          t.equal(user.loginMethods[0].id, phone, "login method id match")
          t.equal(user.loginMethods[0].phone, phone, "login method extra data match")
        }
      ).catch(
        error => t.fail("error " + error)
      )
    })
  })

  t.test('Login with phone and password', t => {
    t.plan(3)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'login',
      parameters: {
        phone: phone,
        passwordHash: passwordHash,
      },
      client: {
        sessionId: sessionId
      }
    }, (cId) => commandId = cId)

    t.test('Check if there are events generated', t => {
      t.plan(2)

      setTimeout(()=>{
        testUtils.getGeneratedEvents(r, 'session', commandId,
          (events) => {
            t.equal(events.length, 1, "generated one event in session list")
            t.equal(events[0].type, "loggedIn", "event is logged in event")
          })
      }, 250)
    })

    t.test('check if logged in', t=> {
      t.plan(2)
      setTimeout(()=>{
        r.table('session').get(sessionId).run(conn).then(
          session => {
            if(!session) t.fail("session not found")
            t.equal(session.user, userId, 'user id match')
            t.pass('logged in')
          }
        ).catch(t.fail)
      }, 150)
    })
  })


  let newPasswordHash

  t.test('change password by user', t => {
    t.plan(2)

    newPasswordHash = crypto.randomBytes(12).toString('hex')

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'updatePasswordByUser',
      parameters: {
        user: userId,
        phone: phone,
        oldPasswordHash: passwordHash,
        newPasswordHash: newPasswordHash
      }
    }, (cId) => { }).then(result => {})

    t.test('Check if the password is changed', t => {
      t.plan(1)
      setTimeout(() => {
        r.table("phonePassword_PhonePassword").get(phone).run(conn).then(
          row => {
            t.equal(row.passwordHash, newPasswordHash, "password hash match")
          }
        ).catch(
          error => t.fail("error " + error)
        )
      }, 350)
    })
  })

  t.test('change all passwords by user', t => {
    t.plan(2)

    let newPasswordHash2 = crypto.randomBytes(12).toString('hex')

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'updateAllPasswordsByUser',
      parameters: {
        user: userId,
        oldPasswordHash: newPasswordHash,
        newPasswordHash: newPasswordHash2
      }
    }, (cId) => { }).then(result => {})

    t.test('Check if the password is changed', t => {
      t.plan(1)
      setTimeout(() => {
        r.table("phonePassword_PhonePassword").get(phone).run(conn).then(
          row => {
            t.equal(row.passwordHash, newPasswordHash2, "password hash match")
          }
        ).catch(
          error => t.fail("error " + error)
        )
      }, 350)
    })
  })

  let resetPasswordCode

  t.test('generate reset password phone', t => {
    t.plan(3)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'startPasswordReset',
      parameters: { phone: phone }
    }, (cId) => { commandId = cId }).then(result => {})

    t.test('Check if there are events generated', t => {
      t.plan(3)

      setTimeout(()=>{
        testUtils.getGeneratedEvents(r, 'phonePassword', commandId,
          (events) => {
            t.equal(events.length, 1, "generated one event in phonePassword list")
            if(events[0].code && events[0].phone) {
              resetPasswordCode = events[0].code
              t.pass('found code in event')
            } else t.fail('code not found')
          })
      }, 350)

      setTimeout(()=>{
        testUtils.getGeneratedEvents(r, 'sms', commandId,
          (events) => {
            t.equal(events.length, 1, "generated sms event in sms list")
          }
        )
      }, 350)
    })

    t.test('Check if there are reset code', t => {
      t.plan(1)
      setTimeout(() => {
        r.table('phonePassword_PhoneKey').get(phone + "_" + resetPasswordCode).run(conn).then(
          row => {
            if(row && row.phone == phone && row.code == resetPasswordCode) {
              t.pass("reset code found")
            } else t.fail("reset code not found")
          }
        )
      }, 350)
    })
  })

  let newPasswordHash3 = crypto.randomBytes(12).toString('hex')

  t.test("Reset password using phone code", t => {
    t.plan(2)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'finishPasswordReset',
      parameters: {
        newPasswordHash: newPasswordHash3,
        code: resetPasswordCode,
        phone
      }
    }, (cId) => { }).then(result => {})

    t.test('Check if the password is changed', t => {
      t.plan(1)
      setTimeout(() => {
        r.table("phonePassword_PhonePassword").get(phone).run(conn).then(
          row => {
            t.equal(row.passwordHash, newPasswordHash3, "password hash match")
          }
        ).catch(
          error => t.fail("error " + error)
        )
      }, 350)
    })
  })

  let newPhone = ""+(Math.random() * 1000000).toFixed()
  let changePhoneCode

  t.test('generate change phone phone', t => {
    t.plan(3)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'startPhoneChange',
      parameters: {
        newPhone: newPhone,
        passwordHash: newPasswordHash3
      },
      client: {
        user: userId
      }
    }, (cId) => { commandId = cId }).then(result => {})

    t.test('Check if there are events generated', t => {
      t.plan(3)

      setTimeout(()=>{
        testUtils.getGeneratedEvents(r, 'phonePassword', commandId,
          (events) => {
            t.equal(events.length, 1, "generated one event in phonePassword list")
            if(events[0].code && events[0].phone) {
              changePhoneCode = events[0].code
              t.pass('found code in event')
            } else t.fail('code not found')
          })
      }, 350)

      setTimeout(()=>{
        testUtils.getGeneratedEvents(r, 'sms', commandId,
          (events) => {
            t.equal(events.length, 1, "generated sms event in sms list")
          }
        )
      }, 350)
    })

    t.test('Check if there are change code', t => {
      t.plan(3)
      setTimeout(() => {
        r.table('phonePassword_PhoneKey').get(newPhone + "_" + changePhoneCode).run(conn).then(
          row => {
            if(row) {
              t.pass("reset key found")
              t.equal(row.newPhone, newPhone, "newPhone match")
              t.equal(row.oldPhone, phone, "phone match")
            } else t.fail("reset key not found")
          }
        )
      }, 350)
    })
  })

  t.test("Change phone using phone key", t => {
    t.plan(2)

    testUtils.runCommand(t, r, 'phonePassword', {
      type: 'finishPhoneChange',
      parameters: {
        code: changePhoneCode,
        phone: newPhone
      }
    }, (cId) => { }).then(result => {})

    t.test('Check if the phone is changed to '+newPhone, t => {
      t.plan(1)
      setTimeout(() => {
        let oldPhonePromise = r.table("phonePassword_PhonePassword").get(phone).run(conn)
        let newPhonePromise = r.table("phonePassword_PhonePassword").get(newPhone).run(conn)
        Promise.all([oldPhonePromise, newPhonePromise]).then(
          ([oldPhoneRow, newPhoneRow]) => {
            if(oldPhoneRow) return t.fail("old phone still exists")
            if(!newPhoneRow) return t.fail("new phone not found")
            t.pass("phone changed")
          }
        ).catch(
          error => t.fail("error " + error)
        )
      }, 350)
    })
  })

  t.test('delete user and check if login method is deleted too', t => {
    t.plan(2)

    testUtils.runCommand(t, r, 'users', {
      type: 'UserDelete',
      client: admin,
      parameters: { user: userId }
    }, (cId) => { }).then(result => {})

    t.test('Check if phonePassword entry are removed', t => {
      t.plan(1)
      setTimeout(() => {
        r.table("phonePassword_PhonePassword").get(newPhone).run(conn).then(
          row => {
            if (!row) t.pass("phone not found")
            else t.fail("phone found " + JSON.stringify(row))
          }
        ).catch(
          error => t.fail("error " + error)
        )
      }, 1250)
    })

  })

  t.test('close connection', t => {
    conn.close(() => {
      t.pass('closed')
      t.end()
    })
  })

})