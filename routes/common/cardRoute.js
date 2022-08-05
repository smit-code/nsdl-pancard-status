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

router.get('/all-card/status', use(cardController.getAllCardStatus))

router.get('/card/status/:cardID', use(cardController.getCardStatus))

router.post('/add-captcha', use(cardController.addCaptchaCode))

router.get('/aaa/get-captcha-image', use(cardController.getCaptchaImage))

router.get('/aaa/add-cards-json', use(cardController.addUserDataFromJson))

module.exports = router
