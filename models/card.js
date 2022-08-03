const mongoose = require('mongoose')
const Schema = mongoose.Schema

const cardSchema = new Schema({
        id: {
            type: Number
        },
        name: {
            type: String
        },
        card_number: {
            type: String
        },
        group: {
            type: String
        },
        bill_amount: {
            type: String
        },
        tds_rate: {
            type: String
        },
        tds_amount: {
            type: String
        },
        captcha_image: {
            type: String
        },
        captcha_code: {
            type: String
        },
        assessment_year: {
            type: String
        },
        mode_of_payment: {
            type: String
        },
        reference_number: {
            type: String
        },
        status: {
            type: String
        },
        account_number: {
            type: String
        },
        date: {
            type: String
        },
        is_confirmed: {
            type: Number
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
