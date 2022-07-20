const puppeteer = require('puppeteer');
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
    try{
        let {cardNumber} = req.params;

        let card = await Card.findOne({card_number: cardNumber});
        if(!card){
            console.log("Card not found")
        }
        const browser = await puppeteer.launch({headless: false});
        const page = await browser.newPage();
        await page.setViewport({width: 1200, height: 720});
        await page.goto('https://tin.tin.nsdl.com/oltas/refund-status-pan.html', {
            waitUntil: 'networkidle2',
        });

        // fetching card details

        // Entering card number
        await page.type('#pannum', card.card_number);
        // Selecting year
        await page.select('select[name="assessmentYear"]', '2022-2023');

        await page.waitForSelector('#imgCode');          // wait for the selector to load
        const element = await page.$('#imgCode');
        const box = await element.boundingBox();
        const x = box['x'];                                // coordinate x
        const y = box['y'];                                // coordinate y
        const w = box['width'];                            // area width
        const h = box['height'];

        let imageName = cardNumber + "-" + Date.now() + ".png";
        await Card.findOneAndUpdate({card_number: card.card_number},{captcha_image: imageName });

        await page.screenshot({'path': `./images/${imageName}`, 'clip': {'x': x, 'y': y, 'width': w, 'height': h}});

        let captchaCode;
        while (true) {
            console.log("IN")
            captchaCode = await Card.findOne({card_number: card.card_number}).select("captcha_code");
            if (captchaCode.captcha_code) {
                break;
            }
        }

        await page.type('#HID_IMG_TXT', captchaCode.captcha_code);

        // Get Response and save TABLE data

    }catch (e) {
       console.log(e)
    }


}
