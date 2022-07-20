const Card = require('../models/card')
const {prepareSuccessResponse} = require('../utils/responseHandler')

exports.addCard = async (req, res, next) => {
    const newCard = new Card({
        name: req.body.name,
        card_number: req.body.card_number,
        group: req.body.group,
        captcha_image: req.body.captcha_image && req.body.captcha_image
    })

    const card = await newCard.save()

    const result = {
        id: card._id,
        card_number: card.card_number,
        name: card.name,
        group: card.group,
        captcha_image: card.captcha_image && card.captcha_image
    }

    return res
        .status(200)
        .json(prepareSuccessResponse(result, 'Card saved successfully'))
}

exports.getCard = async (req, res, next) => {
    const id = req.params.id
    const card = await Card.findById(id)
    if (!card) {
        const error = new Error('Could not find card.')
        error.statusCode = 404
        throw error
    }

    const result = {
        id: card._id,
        name: card.name,
        card_number: card.card_number,
        group: card.group,
        captcha_image: card.captcha_image && card.captcha_image
    }

    return res
        .status(200)
        .json(prepareSuccessResponse(result, 'Card retrieved successfully'))
}

exports.getAllCards = async (req, res, next) => {
    const cards = await Card.find()
    if (!cards) {
        const error = new Error('Cards not found.')
        error.statusCode = 404
        throw error
    }

    return res.render('public/card',{
        cards: cards
    });

    // return res
    //     .status(200)
    //     .json(prepareSuccessResponse(cards, 'Cards retrieved successfully.'))
}

exports.updateCard = async (req, res, next) => {
    const id = req.params.id

    const preCard = {
        name: req.body.name,
        card_number: req.body.card_number,
        group: req.body.group,
        captcha_image: req.body.captcha_image && req.body.captcha_image
    }

    const card = await Card.findByIdAndUpdate(id, preCard)
    if (!card) {
        const error = new Error('Could not find card.')
        error.statusCode = 404
        throw error
    }

    const result = {
        id: card._id,
        name: card.name,
        card_number: card.card_number,
        group: card.group,
        captcha_image: card.captcha_image && card.captcha_image
    }

    return res
        .status(200)
        .json(prepareSuccessResponse(result, 'Card updated successfully.'))
}

exports.deleteCard = async (req, res, next) => {
    const id = req.params.id
    const card = await Card.findByIdAndRemove(id)
    if (!card) {
        const error = new Error('Could not find card.')
        error.statusCode = 404
        throw error
    }

    return res
        .status(200)
        .json(prepareSuccessResponse({}, 'Card deleted successfully.'))
}

exports.getCardStatus = async (req, res, next) => {

}
