const express = require('express')
const router = express.Router()

const cardController = require('../../controllers/cardController')
// const Validator = require('../../utils/validateRequest')

const use = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
}

router.post('/', use(cardController.addCard))

router.get('/:id', use(cardController.getCard))

router.get('/', use(cardController.getAllCards))

router.put('/:id', use(cardController.updateCard))

router.delete('/:id', use(cardController.deleteCard))

router.delete('/status', use(cardController.getCardStatus))

module.exports = router
