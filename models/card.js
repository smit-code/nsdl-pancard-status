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
        is_synced: {
            type: Number,
            default: 0
        },
        is_dispatched: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    })

module.exports = mongoose.model('Card', cardSchema)
