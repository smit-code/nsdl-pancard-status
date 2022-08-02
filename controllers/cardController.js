//Enable stealth mode
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const randomUseragent = require('random-useragent');

const Card = require('../models/card')

const {prepareSuccessResponse} = require('../utils/responseHandler')

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/73.0.3683.75 Safari/537.36';


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

    return res.render('public/card', {
        cards
    })

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

/*exports.getCardStatus = async (req, res, next) => {
    try {
        const {cardNumber} = req.params

        const card = await Card.findOne({card_number: cardNumber})
        if (!card) {
            console.log('Card not found')
        }
        const browser = await puppeteer.launch({headless: false})
        const page = await browser.newPage()
        await page.setViewport({width: 1200, height: 720})
        await page.goto('https://tin.tin.nsdl.com/oltas/refund-status-pan.html', {
            waitUntil: 'networkidle2'
        })

        // fetching card details

        // Entering card number
        await page.type('#pannum', card.card_number)
        // Selecting year
        await page.select('select[name="assessmentYear"]', '2022-2023')

        await page.waitForSelector('#imgCode') // wait for the selector to load
        const element = await page.$('#imgCode')
        const box = await element.boundingBox()
        const x = box.x // coordinate x
        const y = box.y // coordinate y
        const w = box.width // area width
        const h = box.height

        const imageName = cardNumber + '-' + Date.now() + '.png'
        await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_image: imageName})

        await page.screenshot({path: `./images/${imageName}`, clip: {x, y, width: w, height: h}})

        // captchaCode Pass
        let captchaCode
        while (true) {
            console.log('IN')
            captchaCode = await Card.findOne({card_number: card.card_number}).select('captcha_code')
            if (captchaCode.captcha_code) {
                break
            }
        }
        await page.type('#HID_IMG_TXT1', captchaCode.captcha_code)
        await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_code: ''})
        console.log("captcha added")
        console.log("captcha pass")

        await Promise.all([
            page.click('.btn-info'),
            page.waitForNavigation({waitUntil: 'networkidle2'}),
        ]);
        console.log("Form Submit")

        const data = await page.evaluate(() => {
            const tds = Array.from(document.querySelectorAll('table tr td'))
            return tds.map(td => td.innerText)
        });

        let result = JSON.parse(JSON.stringify(data))
        console.log("resultresult", result)

        const preCard = {
            assessment_year: result[1],
            mode_of_payment: result[2],
            reference_number: result[3],
            status: result[4],
            account_number: result[5],
            date: result[6]
        }

        const updatedCard = await Card.findOneAndUpdate({card_number: card.card_number}, preCard)
        console.log("result", updatedCard)


        await browser.close();
        return res.redirect('/cards')

        // Get Response and save TABLE data
    } catch (e) {
        console.log(e)
    }
}*/

exports.getAllCardStatus = async (req, res) => {
    console.log("HITTING")

    const cards = await Card.find()
    if (!cards) {
        console.log('Cards not found')
    }

    await Promise.all(cards.map(async (card) => {
        console.log("1")

        // const browser = await puppeteer.launch({headless: false})
        const browser = await puppeteer.launch()
        const page = await browser.newPage()
        await page.setViewport({width: 1200, height: 720})
        await page.goto('https://tin.tin.nsdl.com/oltas/refund-status-pan.html', {
            waitUntil: 'networkidle2'
        })

        // fetching card details

        // Entering card number
        await page.type('#pannum', card.card_number)
        // Selecting year
        await page.select('select[name="assessmentYear"]', '2022-2023')

        await page.waitForSelector('#imgCode') // wait for the selector to load
        const element = await page.$('#imgCode')
        const box = await element.boundingBox()
        const x = box.x // coordinate x
        const y = box.y // coordinate y
        const w = box.width // area width
        const h = box.height

        const imageName = card.card_number + '-' + Date.now() + '.png'
        await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_image: imageName})

        await page.screenshot({path: `./public/images/${imageName}`, clip: {x, y, width: w, height: h}})

        // captchaCode Pass
        let captchaCode
        while (true) {
            console.log('IN')
            captchaCode = await Card.findOne({card_number: card.card_number}).select('captcha_code')
            if (captchaCode.captcha_code) {
                break
            }
        }
        await page.type('#HID_IMG_TXT1', captchaCode.captcha_code)
        await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_code: '',captcha_image: '' })
        console.log("captcha added")
        console.log("captcha pass")

        await Promise.all([
            page.click('.btn-info'),
            page.waitForNavigation({waitUntil: 'networkidle2'}),
        ]);
        console.log("Form Submit")

        const data = await page.evaluate(() => {
            const tds = Array.from(document.querySelectorAll('table tr td'))
            return tds.map(td => td.innerText)
        });

        let result = JSON.parse(JSON.stringify(data))
        console.log("resultresult", result)

        const preCard = {
            assessment_year: result[1],
            mode_of_payment: result[2],
            reference_number: result[3],
            status: result[4],
            account_number: result[5],
            date: result[6]
        }

        const updatedCard = await Card.findOneAndUpdate({card_number: card.card_number}, preCard)
        console.log("result", updatedCard)
        await browser.close();
    }))

    res.send(prepareSuccessResponse({}, "Success"))
}

exports.addCaptchaCode = async (req, res, next) => {
    try {
        console.log("Add Captcha")
        let { captcha } = req.body
        const updateCaptchaCode = {
            captcha_code: captcha
        }

        const card = await Card.findOneAndUpdate({captcha_image:{$exists:true}}, updateCaptchaCode)
        if (!card) {
            console.log('Card not found')
        }
        return res.redirect('/cards')
    } catch (e) {
        console.log(e)
        return res.redirect('/')
    }
}

exports.getCaptchaImage = async (req, res, next) => {
    console.log("In controller")
    let imageName = await Card.findOne({captcha_image:{$exists:true}})
    console.log("imageName",imageName)
    return res.json(prepareSuccessResponse(imageName, "Captcha image fetch successfully"))
}
