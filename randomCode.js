function randomCode(phone) {
  return new Promise((resolve, reject) => crypto.randomBytes(16, (err, buf) => {
    if(err) reject(err)
    let hex = (crypto.createHash('sha256').update(phone + buf.toString('hex')).digest('hex').slice(0,8))
    let number = +('0x'+hex)
    let numberString = ("" + number).slice(-6)
    resolve(numberString)
  }))
}

module.exports = randomCode