const registerUser = require('./registerUserValidation')
const updateUser = require('./updateUserValidation')
const login = require('./loginUserValidation')

module.exports = {
  registerUser,
  login,
  updateUser
}
