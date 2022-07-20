const mongoose = require('mongoose')
const Schema = mongoose.Schema

const cardSchema = new Schema({
        name: {
            type: String
        },
        card_number: {
            type: String
        },
        group: {
            type: String
        },
        captcha_image: {
            type: String
        },
        captcha_code: {
            type: String
        }
    },
    {
        timestamps: true
    })

// cardSchema.pre('save', async function (next, done) {
//   const errorsMsg = {
//     card_number: 'The card has already exist.',
//   }
//   try {
//     const isCardExist = await mongoose.models.Book.findOne({
//       card_number: this.card_number
//     })
//     if (isCardExist) {
//       if (isCardExist._id !== this._id) {
//         const error = new Error(errorsMsg.isbn)
//         error.statusCode = 422
//         throw error
//       }
//     }
//     const nameExists = await mongoose.models.Book.findOne({
//       name: this.name
//     })
//     if (nameExists) {
//       if (nameExists._id !== this._id) {
//         const error = new Error(errorsMsg.name)
//         error.statusCode = 422
//         throw error
//       }
//     }
//     next()
//   } catch (error) {
//     return next(error)
//   }
// })

module.exports = mongoose.model('Card', cardSchema)
