//Enable stealth mode
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const randomUseragent = require('random-useragent');
const fs = require('fs');

const Card = require('../models/card')

const {prepareSuccessResponse, prepareErrorResponse} = require('../utils/responseHandler')

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
    const cards = await Card.find().sort({is_dispatched: -1}).sort({id: -1})
    if (!cards) {
        const error = new Error('Cards not found.')
        error.statusCode = 404
        throw error
    }

    return res.render('card', {
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

exports.getCardStatus = async (req, res) => {
    console.log("Single Card HITTING")
    const {cardID} = req.params

    const card = await Card.find({_id: cardID})
    if (!card) {
        console.log('Cards not found')
    }

    // const browser = await puppeteer.launch({headless: false})
    const browser = await puppeteer.launch({
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    })
    const page = await browser.newPage()
    await page.setViewport({width: 1200, height: 720})
    await page.goto('https://tin.tin.nsdl.com/oltas/refund-status-pan.html', {
        waitUntil: 'networkidle2'
    })
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

    // wait for 1 second
    await page.waitForTimeout(1000)

    await page.screenshot({path: `./public/images/${imageName}`, clip: {x, y, width: w, height: h}})

    // captchaCode Pass
    let captchaCode
    while (true) {
        console.log('IN')
        captchaCode = await Card.findOne({card_number: card.card_number})
        //console.log("captchaCode", captchaCode)
        if (captchaCode.captcha_code) {
            break
        }
    }

    await page.type('#HID_IMG_TXT1', captchaCode.captcha_code)
    await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_code: '', captcha_image: ''})


    await page.click('.btn-info')
    await page.waitForNavigation({waitUntil: 'networkidle2'})

    const data = await page.evaluate(() => {
        const tds = Array.from(document.querySelectorAll('table tr td'))
        return tds.map(td => td.innerText)
    });

    let result = JSON.parse(JSON.stringify(data))
    //console.log("resultresult", result)

    const preCard = {
        assessment_year: result[1],
        mode_of_payment: result[2],
        reference_number: result[3],
        status: result[4] ? result[4] : "No records found",
        account_number: result[5],
        date: result[6],
        is_synced: 1,
        is_dispatched: result[4] && result[1] ? 1 : 0,
    }
    console.log("preCard", preCard)

    const updatedCard = await Card.findOneAndUpdate({card_number: card.card_number}, preCard)
    //console.log("result", updatedCard)
    await browser.close();

    console.log("Out")

    res.redirect("/")
}

exports.getAllCardStatus = async (req, res) => {
    console.log("HITTING")

    const cards = await Card.find({
        is_synced: 0,
        is_dispatched: 0,
        card_number: {$exists: true, $ne: ""}
    }).sort("id").limit(20);

    if (!cards) {
        return res.status(404).json({
            success: false,
            message: "All cards up to date"
        })
    }

    console.log("Loop Start")
    let j = cards.length;
    for (let i = 0; i < j; i++) {
        console.log("In")
            // const browser = await puppeteer.launch({headless: false})
            const browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            })
            const page = await browser.newPage()
            await page.setViewport({width: 1200, height: 720})
            await page.goto(process.env.SITE_URL, {
                waitUntil: 'networkidle2'
            })
            // Entering card number
            await page.type('#pannum', cards[i].card_number)
            // Selecting year
            await page.select('select[name="assessmentYear"]', '2022-2023')

            await page.waitForSelector('#imgCode') // wait for the selector to load
            const element = await page.$('#imgCode')
            const box = await element.boundingBox()
            const x = box.x // coordinate x
            const y = box.y // coordinate y
            const w = box.width // area width
            const h = box.height

            const imageName = cards[i].card_number + '-' + Date.now() + '.png'
            await Card.findOneAndUpdate({card_number:  cards[i].card_number}, {captcha_image: imageName})

            await page.screenshot({path: `public/images/${imageName}`, clip: {x, y, width: w, height: h}})

            // captchaCode Pass
            let captchaCode
            while (true) {
                console.log('IN')
                captchaCode = await Card.findOne({card_number:  cards[i].card_number})
                //console.log("captchaCode", captchaCode)
                if (captchaCode.captcha_code) {
                    break
                }
            }
            await page.type('#HID_IMG_TXT1', captchaCode.captcha_code)
            await Card.findOneAndUpdate({card_number:  cards[i].card_number}, {captcha_code: '', captcha_image: ''})
            console.log("captcha added")
            console.log("captcha pass")

            await page.click('.btn-info')
            console.log("Form Submit")
            // wait for 1 second
            await page.waitForTimeout(1000)
            console.log("New page")


            const data = await page.evaluate(() => {
                const tds = Array.from(document.querySelectorAll('table tr td'))
                return tds.map(td => td.innerText)
            });

        //const links = await page.$$eval(".hyperlink", element => element.href);

            let result = JSON.parse(JSON.stringify(data))
            //console.log("resultresult", result)

            const preCard = {
                assessment_year: result[1],
                mode_of_payment: result[2],
                reference_number: result[3],
                status: result[4] ? result[4] : "No records found",
                account_number: result[5],
                date: result[6],
                is_synced: 1,
                is_dispatched: result[4] && result[1] ? 1 : 0,
            }
            console.log("preCard", preCard)

            const updatedCard = await Card.findOneAndUpdate({card_number:  cards[i].card_number}, preCard)
            //console.log("result", updatedCard)
            await browser.close();

        console.log("Out")
    }
    console.log("Loop END")
    return res.status(200).json({
        success: true,
        message: "Card Synced"
    })
}

exports.getAllCardStatusNew = async (req, res) => {
    let cards = await Card.find({is_synced: 0, is_dispatched: 0}).sort("id").limit(20);
    if (!cards) {
        console.log('Cards not found')
    }

    async function wait(ms) { // comment 3
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function doSomething() {
        // comment 2
        await wait(1000);
        await cards.reduce(async (promise, card) => {
            console.log("1")
            // const browser = await puppeteer.launch({headless: false})
            const browser = await puppeteer.launch({
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            })
            const page = await browser.newPage()
            await page.setViewport({width: 1200, height: 720})
            await page.goto(process.env.SITE_URL, {
                waitUntil: 'networkidle2'
            })
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

            // wait for 1 second
            await page.waitForTimeout(1000)

            await page.screenshot({path: `/images/${imageName}`, clip: {x, y, width: w, height: h}})

            // captchaCode Pass
            let captchaCode
            while (true) {
                console.log('IN')
                captchaCode = await Card.findOne({card_number: card.card_number})
                //console.log("captchaCode", captchaCode)
                if (captchaCode.captcha_code) {
                    break
                }
            }
            await page.type('#HID_IMG_TXT1', captchaCode.captcha_code)
            await Card.findOneAndUpdate({card_number: card.card_number}, {captcha_code: '', captcha_image: ''})
            console.log("captcha added")
            console.log("captcha pass")

            await page.click('.btn-info')
            await page.waitForNavigation({waitUntil: 'networkidle2'})

            console.log("Form Submit")

            const data = await page.evaluate(() => {
                const tds = Array.from(document.querySelectorAll('table tr td'))
                return tds.map(td => td.innerText)
            });

            let result = JSON.parse(JSON.stringify(data))
            //console.log("resultresult", result)

            const preCard = {
                assessment_year: result[1],
                mode_of_payment: result[2],
                reference_number: result[3],
                status: result[4] ? result[4] : "No records found",
                account_number: result[5],
                date: result[6],
                is_synced: 1,
                is_dispatched: result[4] && result[1] ? 1 : 0,
            }
            console.log("preCard", preCard)

            const updatedCard = await Card.findOneAndUpdate({card_number: card.card_number}, preCard)
            //console.log("result", updatedCard)
            await browser.close();

            // here we could await something else that is async like DB call
            document.getElementById('results').append(`${card} `);
        }, Promise.resolve()); // comment 1
    }

    setTimeout(() => doSomething(), 1000);

    res.redirect("/")
}

exports.addCaptchaCode = async (req, res, next) => {
    try {
        console.log("Add Captcha")
        let {captcha} = req.body
        const updateCaptchaCode = {
            captcha_code: captcha
        }

        const card = await Card.findOneAndUpdate({captcha_image: {$exists: true, $ne: ""}}, updateCaptchaCode)
        if (!card) {
            console.log('Card not found')
        }
        return res.redirect('/')
    } catch (e) {
        console.log(e)
        return res.redirect('/')
    }
}

exports.getCaptchaImage = async (req, res, next) => {
    console.log("In controller")
    let imageName = await Card.findOne({captcha_image: {$exists: true, $ne: ""}})
    console.log("imageName", imageName)
    if (imageName) {
        return res.json(prepareSuccessResponse(imageName, "Captcha image fetch successfully"))
    } else {
        return res.json(prepareErrorResponse("Captcha image not  found"))
    }
}

exports.addUserDataFromJson = async (req, res) => {
    try {
        let userData = [
            {
                "id": 1,
                "name": "KEVAL BHARATBHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DJLPD7670A",
                "total_amount": 95000
            },
            {
                "id": 2,
                "name": "DHAVAL NARESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BBBPN5666G",
                "total_amount": 95000
            },
            {
                "id": 3,
                "name": "DINESHBHAI VALLABHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ARFPN22579Q",
                "total_amount": 95000
            },
            {
                "id": 4,
                "name": "BHAVNABEN JAGDISHBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BCJPV1097C",
                "total_amount": 95000
            },
            {
                "id": 5,
                "name": "SUNITABEN RADADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DAAPR7835H",
                "total_amount": 95000
            },
            {
                "id": 6,
                "name": "MILAN JAYSUKHBHAI RADADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BXCPR7485L",
                "total_amount": 95000
            },
            {
                "id": 7,
                "name": "ASHISH SITAPARA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DAPPS1404A",
                "total_amount": 95000
            },
            {
                "id": 8,
                "name": "PRAGNABEN KARKAR",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "JPNPK4498M",
                "total_amount": 95000
            },
            {
                "id": 9,
                "name": "MAMTABEN MANGUKIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BMWPM2428K",
                "total_amount": 95000
            },
            {
                "id": 10,
                "name": "NARENDRABHAI BHIMANI",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BANPB2401E",
                "total_amount": 95000
            },
            {
                "id": 11,
                "name": "CHANDUBHAI KASWALA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AUCPK8006E",
                "total_amount": 95000
            },
            {
                "id": 12,
                "name": "JAYESH PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CPTPP5534E",
                "total_amount": 95000
            },
            {
                "id": 13,
                "name": "KRISHNA SITAPARA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "NIJPS3419F",
                "total_amount": 45000
            },
            {
                "id": 14,
                "name": "JAGRUTIBEN DHAMELIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BOPPD4287L",
                "total_amount": 95000
            },
            {
                "id": 15,
                "name": "ZEEL MUKESHBHAI LATHIDADIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BHXPL7838J",
                "total_amount": 95000
            },
            {
                "id": 16,
                "name": "PRAFULBHAI UNADKAT",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AEIPU1546H",
                "total_amount": 95000
            },
            {
                "id": 17,
                "name": "HARSHABEN MUKESHBHAI ZALAVADIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ABAPZ2761L",
                "total_amount": 95000
            },
            {
                "id": 18,
                "name": "VIVEK BHOLABHAI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BEPPG4401P",
                "total_amount": 95000
            },
            {
                "id": 19,
                "name": "NITABEN NARESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BWCPN4525L",
                "total_amount": 95000
            },
            {
                "id": 20,
                "name": "PALLAVIBEN CHOVATIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AQMPC7371C",
                "total_amount": 95000
            },
            {
                "id": 21,
                "name": "BHAVESH GAJERA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ANPPG7227F",
                "total_amount": 95000
            },
            {
                "id": 22,
                "name": "JITENDRA VAJA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AJUPV0470E",
                "total_amount": 95000
            },
            {
                "id": 23,
                "name": "MONTU PATEL",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "EQHPP7743C",
                "total_amount": 45000
            },
            {
                "id": 24,
                "name": "SONALBEN AKASHKUMAR KHUNT",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EMXPK8272F",
                "total_amount": 95000
            },
            {
                "id": 25,
                "name": "SHOBHABEN GAJERA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CADPG7259N",
                "total_amount": 95000
            },
            {
                "id": 26,
                "name": "ASHISH NITINBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDTPN8588H",
                "total_amount": 95000
            },
            {
                "id": 27,
                "name": "AVADH DINESHBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BHKPV3545F",
                "total_amount": 95000
            },
            {
                "id": 28,
                "name": "BHARATBHAI UKABHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AOMPD0197F",
                "total_amount": 95000
            },
            {
                "id": 29,
                "name": "BHARGAV YOGESHBHAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DKXPP6944N",
                "total_amount": 95000
            },
            {
                "id": 30,
                "name": "DINESHBHAI RUDABHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HIYPS7290R",
                "total_amount": 95000
            },
            {
                "id": 31,
                "name": "HARDIK DINESHBHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HIYPS7233C",
                "total_amount": 95000
            },
            {
                "id": 32,
                "name": "HARESHBHAI GOVINDBHAI VANANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "BCVPV1893E",
                "total_amount": 45000
            },
            {
                "id": 33,
                "name": "KAJOL PRAKASHBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQPPG5468J",
                "total_amount": 95000
            },
            {
                "id": 34,
                "name": "KAKADIYA LALJIBHAI PRAVINBHAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BOHPK9314R",
                "total_amount": 95000
            },
            {
                "id": 35,
                "name": "KEVIN ASHOKBHAI LATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DZSPA7247F",
                "total_amount": 95000
            },
            {
                "id": 36,
                "name": "KIRANBEN HARESHBHAI VANANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "AVXPV8723F",
                "total_amount": 45000
            },
            {
                "id": 37,
                "name": "MONIKA PRAVINBHAI KAKADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GLJPP2786N",
                "total_amount": 95000
            },
            {
                "id": 38,
                "name": "NAKRANI HITESHBHAI PARSHOTTAMBHAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AFJPN5031J",
                "total_amount": 95000
            },
            {
                "id": 39,
                "name": "PARESHBHAI MUKESHBHAI CHAVDA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BTTPC5679J",
                "total_amount": 95000
            },
            {
                "id": 40,
                "name": "SONANI JITENDRABHAI VALLABHBHAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "LCUPS0406H",
                "total_amount": 95000
            },
            {
                "id": 41,
                "name": "URMIL PRAKASHBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQPPG5469K",
                "total_amount": 95000
            },
            {
                "id": 42,
                "name": "VISHAL PRAVINBHAI KAKADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DVOPK6434A",
                "total_amount": 95000
            },
            {
                "id": 43,
                "name": "BATUKBHAI SAVAJ",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AQEPS4813P",
                "total_amount": 95000
            },
            {
                "id": 44,
                "name": "ALKABEN KAMLESHBHAI RUPARELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BRTPR0099F",
                "total_amount": 95000
            },
            {
                "id": 45,
                "name": "DILIPBHAI TEJABHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AJVPV8547P",
                "total_amount": 95000
            },
            {
                "id": 46,
                "name": "DINESHBHAI SAVJIBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ASXPV0409P",
                "total_amount": 95000
            },
            {
                "id": 47,
                "name": "GHANSHYAM TEJABHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AGIPV8825E",
                "total_amount": 95000
            },
            {
                "id": 48,
                "name": "ILABEN HIRPARA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AOWPH4696F",
                "total_amount": 95000
            },
            {
                "id": 49,
                "name": "KAMLESHBHAI BHANUBHAI RUPARELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AXKPP6952F",
                "total_amount": 95000
            },
            {
                "id": 50,
                "name": "MAYUR DILIPBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AUHPV6717G",
                "total_amount": 95000
            },
            {
                "id": 51,
                "name": "UMESHBHAI BHANUBHAI RUPARELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BYIPR7011R",
                "total_amount": 95000
            },
            {
                "id": 52,
                "name": "BHAVIN HARESHBHAI KALATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BFIPH6172Q",
                "total_amount": 95000
            },
            {
                "id": 53,
                "name": "CHIRAG GHANSHYAMBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CVWPG7175D",
                "total_amount": 95000
            },
            {
                "id": 54,
                "name": "PANKAJBHAI MAVJIBHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "AUDPD3727G",
                "total_amount": 45000
            },
            {
                "id": 55,
                "name": "SONALBEN VIJAYBHAI SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "AQPPL2865B",
                "total_amount": 45000
            },
            {
                "id": 56,
                "name": "VIJAYBHAI GOPALBHAI SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EQRPS3460P",
                "total_amount": 95000
            },
            {
                "id": 57,
                "name": "ANJULABEN PANKAJBHAI DHAMELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CEHPD2678Q",
                "total_amount": 95000
            },
            {
                "id": 58,
                "name": "GHANSHYAMBHAI KARMASIBHAI MANIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AOUPM7461B",
                "total_amount": 95000
            },
            {
                "id": 59,
                "name": "MITUL GHANSHYAMBHAI SHIHORA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FVSPS4714K",
                "total_amount": 95000
            },
            {
                "id": 60,
                "name": "NISHA CHIRAGBHAI JADVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CIGPJ7091E",
                "total_amount": 95000
            },
            {
                "id": 61,
                "name": "PANKAJBHAI MANUBHAI DHAMELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AMTPD1711G",
                "total_amount": 95000
            },
            {
                "id": 62,
                "name": "PIYUSH GHANSHYAMBHAI SHIHORA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FWKPS5443A",
                "total_amount": 95000
            },
            {
                "id": 63,
                "name": "PRAVINBHAI JIVRAJBHAI MORADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BVEPM2322K",
                "total_amount": 95000
            },
            {
                "id": 64,
                "name": "URVASHI BHAUTIKBHAI SHIHORA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "MMWPS3103G",
                "total_amount": 95000
            },
            {
                "id": 65,
                "name": "ARUNABEN VALLABHBHAI SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "LIAPS7186N",
                "total_amount": 95000
            },
            {
                "id": 66,
                "name": "ASHISH DALSUKHBHAI LASHKRI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AIIPL6371K",
                "total_amount": 95000
            },
            {
                "id": 67,
                "name": "GEETABEN DILIPBHAI MORADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CZHPM2071D",
                "total_amount": 95000
            },
            {
                "id": 68,
                "name": "KETANBHAI DULABHAI HADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ARLPH1261N",
                "total_amount": 95000
            },
            {
                "id": 69,
                "name": "MADHAVIBEN MANSUKHBHAI GADHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 70,
                "name": "MITAL BALAVANTBHAI BARAVALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DKLPB4281C",
                "total_amount": 95000
            },
            {
                "id": 71,
                "name": "NATVARLAL BABUBHAI GONDALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ATIPG9472H",
                "total_amount": 95000
            },
            {
                "id": 72,
                "name": "RAHUL KANUBHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CZXPS1481D",
                "total_amount": 95000
            },
            {
                "id": 73,
                "name": "SEJALBEN ASHISHBHAI LASHKARI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDSPL0619J",
                "total_amount": 95000
            },
            {
                "id": 74,
                "name": "SHOBHANABEN DAYABHAI DHAMELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CVMPD2786D",
                "total_amount": 95000
            },
            {
                "id": 75,
                "name": "URVISH VITHALBHAI LATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AOSPL4689L",
                "total_amount": 95000
            },
            {
                "id": 76,
                "name": "VAIBHAV YOGESHBHAI PURANVAIRAGI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FKRPP7435Q",
                "total_amount": 95000
            },
            {
                "id": 77,
                "name": "SHOBHANABEN BALAVANTBHAI BARAVALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CLPPB9353P",
                "total_amount": 95000
            },
            {
                "id": 78,
                "name": "ASHABEN SURESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AMLPN2751Q",
                "total_amount": 95000
            },
            {
                "id": 79,
                "name": "CHIRAGKUMAR SURESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "APGPN1099B",
                "total_amount": 95000
            },
            {
                "id": 80,
                "name": "DINESHBHAI JIVRAJBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "ATTPN5385R",
                "total_amount": 45000
            },
            {
                "id": 81,
                "name": "NILAMBEN GAUTAMBHAI ANGHAN",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BEBPD4397H",
                "total_amount": 95000
            },
            {
                "id": 82,
                "name": "PAYALBEN RAHULBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BFRPN0174B",
                "total_amount": 95000
            },
            {
                "id": 83,
                "name": "RAHUL VINUBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "APIPN9042A",
                "total_amount": 95000
            },
            {
                "id": 84,
                "name": "SEJALBEN ASHOKBHAI RADADIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BTWPR5847L",
                "total_amount": 95000
            },
            {
                "id": 85,
                "name": "JITUBEN R RADADIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZOPR8719M",
                "total_amount": 95000
            },
            {
                "id": 86,
                "name": "KANJI D VAGHASIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ALMPV0034A",
                "total_amount": 95000
            },
            {
                "id": 87,
                "name": "MITIKSHA PARESHBHAI GOTI",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DSVPG3022C",
                "total_amount": 95000
            },
            {
                "id": 88,
                "name": "BHAVANABEN NIPULBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQAPV4432Q",
                "total_amount": 95000
            },
            {
                "id": 89,
                "name": "NIPUL MAGANBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AFKPV8591G",
                "total_amount": 95000
            },
            {
                "id": 90,
                "name": "JIGNESHBHAI HARESHBHAI SONDAGAR",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "NYIPS9244B",
                "total_amount": 95000
            },
            {
                "id": 91,
                "name": "ASHABEN DHARMESHBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GKJPD3372M",
                "total_amount": 95000
            },
            {
                "id": 92,
                "name": "ASHABEN ASHOKBHAI LATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ATAPL3647H",
                "total_amount": 95000
            },
            {
                "id": 93,
                "name": "ASMITABEN MUKESHBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DUBPG1956F",
                "total_amount": 95000
            },
            {
                "id": 94,
                "name": "BHARGAV PRAVINBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CMFPN9154F",
                "total_amount": 95000
            },
            {
                "id": 95,
                "name": "DAYABEN VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AXFPV0062M",
                "total_amount": 95000
            },
            {
                "id": 96,
                "name": "DHARMISHTHABEN GHORI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DTLPG7230R",
                "total_amount": 95000
            },
            {
                "id": 97,
                "name": "GAUTAM RAVJIBHAI ANGHAN",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BEKPA4567D",
                "total_amount": 95000
            },
            {
                "id": 98,
                "name": "GEETABEN SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CFEPS4023J",
                "total_amount": 95000
            },
            {
                "id": 99,
                "name": "GHANSHYAMBHAI VAJUBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AVVPG3314M",
                "total_amount": 95000
            },
            {
                "id": 100,
                "name": "GOPI SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "PCZPS3405P",
                "total_amount": 95000
            },
            {
                "id": 101,
                "name": "JAGDISHBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BHUPV3039C",
                "total_amount": 95000
            },
            {
                "id": 102,
                "name": "JINAL VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BWAPV4716M",
                "total_amount": 95000
            },
            {
                "id": 103,
                "name": "KEVAL SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HHPPS4594N",
                "total_amount": 95000
            },
            {
                "id": 104,
                "name": "KINJAL VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQBPV1746C",
                "total_amount": 95000
            },
            {
                "id": 105,
                "name": "KIRITBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AXFPV0483N",
                "total_amount": 95000
            },
            {
                "id": 106,
                "name": "MANISHABEN MUKESHBHAI ANGHAN",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CLZPA9436N",
                "total_amount": 95000
            },
            {
                "id": 107,
                "name": "MANJULABEN VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ASXPV0373J",
                "total_amount": 95000
            },
            {
                "id": 108,
                "name": "MEERABEN GHANSHYAMBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DFRPG7701B",
                "total_amount": 95000
            },
            {
                "id": 109,
                "name": "MILAN MANOJBHAI TEJANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BSPPT0724E",
                "total_amount": 95000
            },
            {
                "id": 110,
                "name": "MUKESHBHAI VAJUBHAI GORASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AVVPG3313N",
                "total_amount": 95000
            },
            {
                "id": 111,
                "name": "NAMRATA UMANGBHAI ITALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AMUPI7854E",
                "total_amount": 95000
            },
            {
                "id": 112,
                "name": "NITABEN BHALANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQYPB8021M",
                "total_amount": 95000
            },
            {
                "id": 113,
                "name": "RADHIKA SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "MFNPS2356R",
                "total_amount": 95000
            },
            {
                "id": 114,
                "name": "RAMNIKBHAI BHALANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQYPB8023K",
                "total_amount": 95000
            },
            {
                "id": 115,
                "name": "RIDDHI SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "PCZPS3469D",
                "total_amount": 95000
            },
            {
                "id": 116,
                "name": "SAGAR KHER ",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GAEPK8434E",
                "total_amount": 95000
            },
            {
                "id": 117,
                "name": "SAVITABEN SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "LJDPS5348L",
                "total_amount": 95000
            },
            {
                "id": 118,
                "name": "SEJAL GOHIL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "MYFPS1245C",
                "total_amount": 95000
            },
            {
                "id": 119,
                "name": "SHAILESHBHAI GOHIL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CCWPG4540B",
                "total_amount": 95000
            },
            {
                "id": 120,
                "name": "VARSHABEN BHARATBHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ATHPD8542L",
                "total_amount": 95000
            },
            {
                "id": 121,
                "name": "VASANTBEN KYADA ",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "JDDPK0250H",
                "total_amount": 95000
            },
            {
                "id": 122,
                "name": "VIKAS MAKWANA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CDQPM0068K",
                "total_amount": 95000
            },
            {
                "id": 123,
                "name": "VISHAL BHALANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AWBPB6631M",
                "total_amount": 95000
            },
            {
                "id": 124,
                "name": "VISHAL HARESHBHAI KALATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "ETLPK2608J",
                "total_amount": 45000
            },
            {
                "id": 125,
                "name": "YOGESH MANSUKHBHAI CHBHADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HVEPS5100M",
                "total_amount": 95000
            },
            {
                "id": 126,
                "name": "BHAVESHBHAI NARANBHAI BELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDNPB0089D",
                "total_amount": 95000
            },
            {
                "id": 127,
                "name": "REKHABEN VIMALBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BSNPN6784J",
                "total_amount": 95000
            },
            {
                "id": 128,
                "name": "SURESHBHAI CHAGANBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AGZPN7915Q",
                "total_amount": 95000
            },
            {
                "id": 129,
                "name": "UMANG ITALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AAYPI1534R",
                "total_amount": 95000
            },
            {
                "id": 130,
                "name": "VIKRAM CHAVDA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BXIPC2382K",
                "total_amount": 95000
            },
            {
                "id": 131,
                "name": "ANITABEN GHANSHYAMBHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AJVPV8548C",
                "total_amount": 95000
            },
            {
                "id": 132,
                "name": "DAKSHABEN DHRANA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HCVPD6537F",
                "total_amount": 95000
            },
            {
                "id": 133,
                "name": "GORIBEN MUKESHBHAI DESAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HGLPD3121H",
                "total_amount": 95000
            },
            {
                "id": 134,
                "name": "MUKESHBHAI KESHUBHAI DESAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CVDPD6552L",
                "total_amount": 95000
            },
            {
                "id": 135,
                "name": "RAJUBHAI KESHUBHAI DESAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GGHPD7479H",
                "total_amount": 95000
            },
            {
                "id": 136,
                "name": "RUPAL JIGNESHBHAI KOTHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IQDPK3761F",
                "total_amount": 95000
            },
            {
                "id": 137,
                "name": "SANTABEN DHRANA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HNQPD4352E",
                "total_amount": 95000
            },
            {
                "id": 138,
                "name": "HARDIK JALODRA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 139,
                "name": "ATULBHAI BABUBHAI BORAD",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 140,
                "name": "DHIRUBHAI RUDABHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 141,
                "name": "GAUTAM SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GYRPS4253N",
                "total_amount": 95000
            },
            {
                "id": 142,
                "name": "HARDIK SORATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 143,
                "name": "JAYSHREE DINESHBHAI BORAD",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 144,
                "name": "NARESHKUMAR B TADHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 145,
                "name": "PARAS SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 146,
                "name": "RAVINABEN PRAVINBHAI KAKADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 147,
                "name": "SHRADBHAI SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 148,
                "name": "SONAM VISHAL BHALANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 149,
                "name": "DARSHAN JAGDISHBHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EKUPD9034B",
                "total_amount": 95000
            },
            {
                "id": 150,
                "name": "MAYUR VITTHALBHAI SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IETPS4477G",
                "total_amount": 95000
            },
            {
                "id": 151,
                "name": "UMESH MOHANBHAI DUNGARANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CSLPD2346D",
                "total_amount": 95000
            },
            {
                "id": 152,
                "name": "BHAVNABEN G CHABHADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 153,
                "name": "GHANSHYAMBHAI CHABHADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 154,
                "name": "PARTH JETANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 155,
                "name": "PIYUSH CHABHADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 156,
                "name": "SHILPABEN JETANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 157,
                "name": "ABHISHEK LATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 158,
                "name": "REKHABEN HASHMUKHBHAI LATHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 159,
                "name": "USHABEN NITINBHAI RADADIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZOPR9185F",
                "total_amount": 95000
            },
            {
                "id": 160,
                "name": "AKSHITA RAMESHBHAI RADADIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DRQPR0914G",
                "total_amount": 95000
            },
            {
                "id": 161,
                "name": "JAYSHRIBEN JADAVBHAI SONANI",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "KIYPS3206J",
                "total_amount": 95000
            },
            {
                "id": 162,
                "name": "PRADIPBHAI BHIMJIBHAI VAVDIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AQXPV0736F",
                "total_amount": 95000
            },
            {
                "id": 163,
                "name": "RIDDHI CHIMANBHAI SONDAGAR",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FTFPR9991Q",
                "total_amount": 95000
            },
            {
                "id": 164,
                "name": "RANJANBEN CHIMANBHAI SONDAGAR",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CMNPS2665A",
                "total_amount": 95000
            },
            {
                "id": 165,
                "name": "AKASH NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDUPN2357K",
                "total_amount": 95000
            },
            {
                "id": 166,
                "name": "BHAUTIK JALODRA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BRYPJ3670B",
                "total_amount": 95000
            },
            {
                "id": 167,
                "name": "BHAVNABEN N NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZZPN8789G",
                "total_amount": 95000
            },
            {
                "id": 168,
                "name": "HIREN MAKWANA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "EJMPM1795M",
                "total_amount": 45000
            },
            {
                "id": 169,
                "name": "JALPA PATEL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CEKPJ4256D",
                "total_amount": 95000
            },
            {
                "id": 170,
                "name": "MANISHABEN BHANUBHAI KACHHADIYA ",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "AQPPK9854R",
                "total_amount": 45000
            },
            {
                "id": 171,
                "name": "NISHANT PATEL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DQOPP0253D",
                "total_amount": 95000
            },
            {
                "id": 172,
                "name": "PALLAVI JALODRA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CDAPJ2325L",
                "total_amount": 95000
            },
            {
                "id": 173,
                "name": "PRABHABEN JALODRA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BSBPJ6434P",
                "total_amount": 95000
            },
            {
                "id": 174,
                "name": "RUSHITA GUJARATI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CWPPG3713F",
                "total_amount": 95000
            },
            {
                "id": 175,
                "name": "SAROJ JALODRA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AWQPJ5946G",
                "total_amount": 95000
            },
            {
                "id": 176,
                "name": "SHRADDHA CHOPDA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CQKPC9831M",
                "total_amount": 95000
            },
            {
                "id": 177,
                "name": "SONAL CHITALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CRBPC6430J",
                "total_amount": 95000
            },
            {
                "id": 178,
                "name": "VIVEK GUJARATI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "BYBPG3210J",
                "total_amount": 45000
            },
            {
                "id": 179,
                "name": "DIPALI TRIENDRABHAI CHAUHAN",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BRNPC6211L",
                "total_amount": 95000
            },
            {
                "id": 180,
                "name": "GAURAV CHIMANBHAI SONDAGAR",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "JLAPS6906M",
                "total_amount": 45000
            },
            {
                "id": 181,
                "name": "CHIRAG RAMESHBHAI DAVARIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "CIUPD1140E",
                "total_amount": 45000
            },
            {
                "id": 182,
                "name": "JASMIKA NIPULBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CCXPV0697M",
                "total_amount": 95000
            },
            {
                "id": 183,
                "name": "GAURAV NIPULBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "BCRPV0282K",
                "total_amount": 45000
            },
            {
                "id": 184,
                "name": "VIPASHA PRAVINBHAI GAJERA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CALPG0124L",
                "total_amount": 95000
            },
            {
                "id": 185,
                "name": "DAYA HIREN GHEVARIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DEQPG6546Q",
                "total_amount": 95000
            },
            {
                "id": 186,
                "name": "PARULBEN BHAVESHBHAI GAJERA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDYPV6988G",
                "total_amount": 95000
            },
            {
                "id": 187,
                "name": "MAYABEN MANUBHAI SOLANKI",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IYWPS1663B",
                "total_amount": 95000
            },
            {
                "id": 188,
                "name": "DHARMESHBHAI PARBATBHAI SHELADIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CUCPS5496L",
                "total_amount": 95000
            },
            {
                "id": 189,
                "name": "SHRADDHA SURESHBHAI CHIKHALIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BUYPC5066P",
                "total_amount": 95000
            },
            {
                "id": 190,
                "name": "VISHAL DAMJIBHAI DHANDHUKIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EFSPD8916M",
                "total_amount": 95000
            },
            {
                "id": 191,
                "name": "DAXABEN KANAKBHAI THUMMAR",
                "group": "RAJESH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ANZPT2504N",
                "total_amount": 95000
            },
            {
                "id": 192,
                "name": "ARMY RAJESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FEQPR4173Q",
                "total_amount": 95000
            },
            {
                "id": 193,
                "name": "BHAVIN VIRANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BTEPV8595D",
                "total_amount": 95000
            },
            {
                "id": 194,
                "name": "CHANDUBHAI DABHI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "CMNPD7128P",
                "total_amount": 45000
            },
            {
                "id": 195,
                "name": "CHIRAG MANJIBHAI VIROLIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "AVXPV7825N",
                "total_amount": 45000
            },
            {
                "id": 196,
                "name": "DIVYA VALLABHBHAI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CHTPV9407N",
                "total_amount": 95000
            },
            {
                "id": 197,
                "name": "GEETABEN KOTHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "LPFPK4618M",
                "total_amount": 95000
            },
            {
                "id": 198,
                "name": "HARSHAD DOBARIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "FBNPD0606N",
                "total_amount": 45000
            },
            {
                "id": 199,
                "name": "HETAL SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "DFHPS4452B",
                "total_amount": 45000
            },
            {
                "id": 200,
                "name": "JAYESHBHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "GVUPS2176C",
                "total_amount": 45000
            },
            {
                "id": 201,
                "name": "KAMLESHBHAI DHIRAJBHAI SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "total_amount": 95000
            },
            {
                "id": 202,
                "name": "KAUSHAL JANJADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CJCPJ7746R",
                "total_amount": 95000
            },
            {
                "id": 203,
                "name": "SONALBEN BHAVESHBHAI BELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GGSPB1178N",
                "total_amount": 95000
            },
            {
                "id": 204,
                "name": "SUNIL BHINGARADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZMPB6367D",
                "total_amount": 95000
            },
            {
                "id": 205,
                "name": "TULSI VALLABHBHAI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CHTPV9344N",
                "total_amount": 95000
            },
            {
                "id": 206,
                "name": "UMESH KALUBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CFVPN6258P",
                "total_amount": 95000
            },
            {
                "id": 207,
                "name": "URVASHI GADHIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DJXPG5002H",
                "total_amount": 95000
            },
            {
                "id": 208,
                "name": "VAIBHAV DABHI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "FDSPD3445L",
                "total_amount": 45000
            },
            {
                "id": 209,
                "name": "HEMAL KIRITBHAI PATEL",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BFSPP6873G",
                "total_amount": 95000
            },
            {
                "id": 210,
                "name": "RAJESHBHAI VALLABHBHAI CHOVATIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AHQPC1503K",
                "total_amount": 95000
            },
            {
                "id": 211,
                "name": "VIJAYBHAI MOHANBHAI DAVARIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "CLIPD7951A",
                "total_amount": 45000
            },
            {
                "id": 212,
                "name": "RENUKABEN PRADIPBHAI VAVDIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AQXPV0765C",
                "total_amount": 95000
            },
            {
                "id": 213,
                "name": "NIKHIL BODRA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DCOPB0283H",
                "total_amount": 95000
            },
            {
                "id": 214,
                "name": "KAVITA PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GUSPD3020D",
                "total_amount": 95000
            },
            {
                "id": 215,
                "name": "ILABEN KIRTIKBHAI RABADIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BGKPR6661M",
                "total_amount": 95000
            },
            {
                "id": 216,
                "name": "JIGNASHA RAMESHBHAI BHAYANI",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CQTPB0330B",
                "total_amount": 95000
            },
            {
                "id": 217,
                "name": "POONAMBEN PRADIPBHAI RABADIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DKMPR3776R",
                "total_amount": 95000
            },
            {
                "id": 218,
                "name": "PRABHABEN PATEL",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BLJPP4952P",
                "total_amount": 95000
            },
            {
                "id": 219,
                "name": "PRADIPKUMAR SHANTILAL RABADIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ATUPR8578D",
                "total_amount": 95000
            },
            {
                "id": 220,
                "name": "KISHORBHAI BORDA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CKKPB6682D",
                "total_amount": 95000
            },
            {
                "id": 221,
                "name": "NAYNABEN DHAMELIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CTPPD2366E",
                "total_amount": 95000
            },
            {
                "id": 222,
                "name": "HETALBEN JAYESHBHAI MANDANKA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CWXPM8622B",
                "total_amount": 95000
            },
            {
                "id": 223,
                "name": "SAILESHBHAI DHOLIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "AUCPD2283Q",
                "total_amount": 45000
            },
            {
                "id": 224,
                "name": "SEEMA SEN",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "LZLPS2876R",
                "total_amount": 95000
            },
            {
                "id": 225,
                "name": "DIPALIBEN DHAMELIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DDBPD5802G",
                "total_amount": 95000
            },
            {
                "id": 226,
                "name": "BHAVESHKUMAR R PATEL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ANAPP8237H",
                "total_amount": 95000
            },
            {
                "id": 227,
                "name": "DEEP NITINBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CLOPN9319N",
                "total_amount": 95000
            },
            {
                "id": 228,
                "name": "DHAVAL ARVINDBHAI DOBARIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DFSPD7444P",
                "total_amount": 95000
            },
            {
                "id": 229,
                "name": "DHAVAL JAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "BBYPJ9663E",
                "total_amount": 45000
            },
            {
                "id": 230,
                "name": "DIXIT DHANJIBHAI BORADA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CRTPB4999R",
                "total_amount": 95000
            },
            {
                "id": 231,
                "name": "DRAWKESH VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ARGPV1975J",
                "total_amount": 95000
            },
            {
                "id": 232,
                "name": "EVANSI PANELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "GAMPP6892K",
                "total_amount": 45000
            },
            {
                "id": 233,
                "name": "GAURAB JAGDISHBHAI DHOLA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HMPPD4144A",
                "total_amount": 95000
            },
            {
                "id": 234,
                "name": "HETALBEN JAGDISHBHAI DAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CMWPJ2657L",
                "total_amount": 95000
            },
            {
                "id": 235,
                "name": "JALODRA RINKALBEN",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CHAPJ4402L",
                "total_amount": 95000
            },
            {
                "id": 236,
                "name": "JAYDIP L RATHOD",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DXGPR3786E",
                "total_amount": 95000
            },
            {
                "id": 237,
                "name": "KAMLESH RANGLAL PALIWAL",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DFKPP2860F",
                "total_amount": 95000
            },
            {
                "id": 238,
                "name": "LATABEN PURNVERAGI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DUKPP3348P",
                "total_amount": 95000
            },
            {
                "id": 239,
                "name": "MALTIBEN KHENI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "PKWPS6156N",
                "total_amount": 95000
            },
            {
                "id": 240,
                "name": "MANISHABEN JAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "DLVPG4979P",
                "total_amount": 45000
            },
            {
                "id": 241,
                "name": "PARITA ALPESHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BRLPN3989E",
                "total_amount": 95000
            },
            {
                "id": 242,
                "name": "PATEL ASHABEN BHAVESHBHAI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GGSPB0876B",
                "total_amount": 95000
            },
            {
                "id": 243,
                "name": "PINALBEN CHIRAGKUMAR NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CRTPN2501F",
                "total_amount": 95000
            },
            {
                "id": 244,
                "name": "PRAKASH BHUPATBHAI DABHI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HIPPD7695A",
                "total_amount": 95000
            },
            {
                "id": 245,
                "name": "PRAVIN CHAVDA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BHSPC0860L",
                "total_amount": 95000
            },
            {
                "id": 246,
                "name": "RANJIT PADYUMANBHAI GODALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZIPG6437P",
                "total_amount": 95000
            },
            {
                "id": 247,
                "name": "RAVIKUMAR DEVSHIBHAI RAKHOLIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BYSPR8004C",
                "total_amount": 95000
            },
            {
                "id": 248,
                "name": "RAVINDRABHAI VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AHZPV4098H",
                "total_amount": 95000
            },
            {
                "id": 249,
                "name": "REENABEN VALLABHBHAI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DKMPG9358G",
                "total_amount": 95000
            },
            {
                "id": 250,
                "name": "VAJUBHAI MOHANBHAI SAVALIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EKMPS8250L",
                "total_amount": 95000
            },
            {
                "id": 251,
                "name": "VANDANBEN ATULBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BOIPN8894J",
                "total_amount": 95000
            },
            {
                "id": 252,
                "name": "PIYUSHBHAI MANDANAKA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ASPPM3554L",
                "total_amount": 95000
            },
            {
                "id": 253,
                "name": "SAMBAD AJAY VASTABHAI",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BZUPV2790N",
                "total_amount": 95000
            },
            {
                "id": 254,
                "name": "KAIASHBEN PARESHBHAI VAGHELA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FTPPP5325A",
                "total_amount": 95000
            },
            {
                "id": 255,
                "name": "DEEPABEN JAGDISHBHAI CHAUHAN",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BCVPC3866N",
                "total_amount": 95000
            },
            {
                "id": 256,
                "name": "RAM SINGH",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EWHPS8250P",
                "total_amount": 95000
            },
            {
                "id": 257,
                "name": "OM PIYUSHBHAI MANDANKA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FZSPM0616J",
                "total_amount": 95000
            },
            {
                "id": 258,
                "name": "KHUSHALI DHOLIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GVMPD6106B",
                "total_amount": 95000
            },
            {
                "id": 259,
                "name": "SAHIL DHOLIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GYGPD6029C",
                "total_amount": 95000
            },
            {
                "id": 260,
                "name": "BHARATIBEN KAKADIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 35000,
                "card_number": "EXHPK5355L",
                "total_amount": 80000
            },
            {
                "id": 261,
                "name": "RAVI CHIMANBHAI KAKADIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 32500,
                "card_number": "EMTPK6722A",
                "total_amount": 77500
            },
            {
                "id": 262,
                "name": "RAJESHBHAI BORDA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DXSPB7267Q",
                "total_amount": 95000
            },
            {
                "id": 263,
                "name": "RAVIKANT TAPARIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "AGQPT8080P",
                "total_amount": 45000
            },
            {
                "id": 264,
                "name": "SAILESHBHAI SOLANKI",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "KPQPS1390N",
                "total_amount": 95000
            },
            {
                "id": 265,
                "name": "HARESHBHAI DANKHRA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ASGPD2583H",
                "total_amount": 95000
            },
            {
                "id": 266,
                "name": "UMESH PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CEJPP4352R",
                "total_amount": 95000
            },
            {
                "id": 267,
                "name": "DAYABEN KORAT",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "BMRPK6899K",
                "total_amount": 45000
            },
            {
                "id": 268,
                "name": "DEVANGI VEKARIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "CCCPV6161M",
                "total_amount": 45000
            },
            {
                "id": 269,
                "name": "HARDIK MAKVANA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "CRLPM8189G",
                "total_amount": 45000
            },
            {
                "id": 270,
                "name": "SHREYANSE DEVANI",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "BYYPD4163N",
                "total_amount": 45000
            },
            {
                "id": 271,
                "name": "SONAL PARMAR",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "CWJPP4338P",
                "total_amount": 45000
            },
            {
                "id": 272,
                "name": "URMILABEN VEKARIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "AVSPV5410G",
                "total_amount": 45000
            },
            {
                "id": 273,
                "name": "HANSABEN KHOKHAR ",
                "group": "RAJESHBHAI",
                "tds_amount1": 45000,
                "card_number": "DOKPK4583M",
                "total_amount": 45000
            },
            {
                "id": 274,
                "name": "NILAMBEN KHOKHAR",
                "group": "RAJESHBHAI",
                "tds_amount1": 45000,
                "card_number": "DUBPK0947Q",
                "total_amount": 45000
            },
            {
                "id": 275,
                "name": "JASMIN RAJESHBHAI PIPALIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DUHPP6994L",
                "total_amount": 95000
            },
            {
                "id": 276,
                "name": "HITESHKUMAR SUNDERLAL SURANA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BEHPS1740D",
                "total_amount": 95000
            },
            {
                "id": 277,
                "name": "DARSHAN MODI",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 35000,
                "card_number": "GGUPM7083K",
                "total_amount": 80000
            },
            {
                "id": 278,
                "name": "HARSHITKUMAR KANTHARIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 35000,
                "card_number": "GVFPK9639K",
                "total_amount": 80000
            },
            {
                "id": 279,
                "name": "SAGAR H KANTHARIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 35000,
                "card_number": "DHOPK8629H",
                "total_amount": 80000
            },
            {
                "id": 280,
                "name": "JAGDISHBHAI DHOLA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AXAPD6926H",
                "total_amount": 95000
            },
            {
                "id": 281,
                "name": "VANITABEN V PURNVAIRAGI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DUKPP3349N",
                "total_amount": 95000
            },
            {
                "id": 282,
                "name": "UPENDRA P SAH",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DXRPS9281J",
                "total_amount": 95000
            },
            {
                "id": 283,
                "name": "KANUBHAI SUVAGIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BDAPS9413H",
                "total_amount": 95000
            },
            {
                "id": 284,
                "name": "NIKUNJ I PARMAR",
                "group": "JAYAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CUIPP1735M",
                "total_amount": 95000
            },
            {
                "id": 285,
                "name": "ARUNABEN PAELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "FOWPP7440N",
                "total_amount": 45000
            },
            {
                "id": 286,
                "name": "DIPAKUKUAMAR PURNVAIRAGI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DRKPP1687Q",
                "total_amount": 95000
            },
            {
                "id": 287,
                "name": "GHASHYAMBHAI JAYANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "BBZPJ5539C",
                "total_amount": 45000
            },
            {
                "id": 288,
                "name": "HETALBEN MANIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DJRPM3642H",
                "total_amount": 95000
            },
            {
                "id": 289,
                "name": "JAYSUKHBHAI PANELIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "BDVPP1686G",
                "total_amount": 45000
            },
            {
                "id": 290,
                "name": "JAGDISHBHAI SHIROYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DPUPS3635P",
                "total_amount": 95000
            },
            {
                "id": 291,
                "name": "KANSHANBEN VAGHASIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AJVPV8546N",
                "total_amount": 95000
            },
            {
                "id": 292,
                "name": "MANSUKHBHAI JANJADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AQTPJ9211B",
                "total_amount": 95000
            },
            {
                "id": 293,
                "name": "NILAMBEN MANIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EBRPM2836N",
                "total_amount": 95000
            },
            {
                "id": 294,
                "name": "RUCHIT SARDHARA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "KDAPS7560C",
                "total_amount": 95000
            },
            {
                "id": 295,
                "name": "KANUBHAI DOBARIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "AMMPD0257G",
                "total_amount": 45000
            },
            {
                "id": 296,
                "name": "VIMAL MANIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CMMPM4020N",
                "total_amount": 95000
            },
            {
                "id": 297,
                "name": "HETALBEN DHAMELIYA",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GFMPB2988M",
                "total_amount": 95000
            },
            {
                "id": 298,
                "name": "GITABEN BAVADIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ALOPB2532K",
                "total_amount": 95000
            },
            {
                "id": 299,
                "name": "PRAKSHBHAI BAVADIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ALNPB2392L",
                "total_amount": 95000
            },
            {
                "id": 300,
                "name": "ABDUL KARIM KHURSHID HUSEN",
                "group": "JAYDIP",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "AATPQ7494H",
                "total_amount": 95000
            },
            {
                "id": 301,
                "name": "HIRABAI PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GPPPP4511D",
                "total_amount": 95000
            },
            {
                "id": 302,
                "name": "SHILPABEN GOHIL",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BUFPG0805F",
                "total_amount": 95000
            },
            {
                "id": 303,
                "name": "JITESH GOHIL",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ANWPG8195K",
                "total_amount": 95000
            },
            {
                "id": 304,
                "name": "KETAN DIYORA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CHDPD0052R",
                "total_amount": 95000
            },
            {
                "id": 305,
                "name": "MILAN DHANANI",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EFNPD4409A",
                "total_amount": 95000
            },
            {
                "id": 306,
                "name": "PRIYANKA KHUNT",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IMUPK7896E",
                "total_amount": 95000
            },
            {
                "id": 307,
                "name": "SMIT MAHYAVANSI",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FBKPM3084A",
                "total_amount": 95000
            },
            {
                "id": 308,
                "name": "JENISH GHEVARIYA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DKQPG3400P",
                "total_amount": 95000
            },
            {
                "id": 309,
                "name": "RAMESHBHAI MAKVANA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BAIPM0942E",
                "total_amount": 95000
            },
            {
                "id": 310,
                "name": "SMIT GAJERA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DFWPG0930P",
                "total_amount": 95000
            },
            {
                "id": 311,
                "name": "SARANGI CHOVATIYA",
                "group": "NANDAN",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CDOPC4999P",
                "total_amount": 95000
            },
            {
                "id": 312,
                "name": "KRUNALI MOVALIYA",
                "group": "JAYDIP",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BQWPB3481R",
                "total_amount": 95000
            },
            {
                "id": 313,
                "name": "VAISHALI BABRIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CWEPB5457J",
                "total_amount": 95000
            },
            {
                "id": 314,
                "name": "BHARTIBEN DOMADIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CIUPD8472P",
                "total_amount": 95000
            },
            {
                "id": 315,
                "name": "SEJALBEN CHAHAN",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CRCPC6547H",
                "total_amount": 95000
            },
            {
                "id": 316,
                "name": "KHUSHAL DOBARIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "BMHPD7584C",
                "total_amount": 45000
            },
            {
                "id": 317,
                "name": "ARTI SUHAGIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "GCRPS7483E",
                "total_amount": 45000
            },
            {
                "id": 318,
                "name": "MUKESHBHAI KORAT",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "AOGPK7204L",
                "total_amount": 45000
            },
            {
                "id": 319,
                "name": "BHUMIKA ZALAVADIYA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "card_number": "ADPPZ5253N",
                "total_amount": 45000
            },
            {
                "id": 320,
                "name": "VOGESH TRADA",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "APIPT0363A",
                "total_amount": 95000
            },
            {
                "id": 321,
                "name": "RAJESHKUMAR SHEKHDA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FLRPS5507M",
                "total_amount": 95000
            },
            {
                "id": 322,
                "name": "JANVI TEJANI",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BSMPT6029B",
                "total_amount": 95000
            },
            {
                "id": 323,
                "name": "HANSABEN MADAKANA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DQSPM2184N",
                "total_amount": 95000
            },
            {
                "id": 324,
                "name": "VRAJLAL MADAKANA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "ATKPM1029L",
                "total_amount": 95000
            },
            {
                "id": 325,
                "name": "VIPULBHAI JALANDHARA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BHBPJ2369A",
                "total_amount": 95000
            },
            {
                "id": 326,
                "name": "PARULBEN SHELADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "PGPPS5218J",
                "total_amount": 95000
            },
            {
                "id": 327,
                "name": "HETALBEN SAVANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "PIPPS4736B",
                "total_amount": 95000
            },
            {
                "id": 328,
                "name": "KALUBHAI KHOKHAR",
                "group": "RAJUBHAI",
                "tds_amount1": 45000,
                "card_number": "ABQPK7937D",
                "total_amount": 45000
            },
            {
                "id": 329,
                "name": "HET GODHANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CEPPG1469E",
                "total_amount": 95000
            },
            {
                "id": 330,
                "name": "CHIMANBHAI SONDAGAR",
                "group": "GAURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CCGPS7478Q",
                "total_amount": 95000
            },
            {
                "id": 331,
                "name": "BHIMJIBHAI SAKDASARIYA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FXIPS7132D",
                "total_amount": 95000
            },
            {
                "id": 332,
                "name": "VASANTBEN SAKDASARIYA",
                "group": "ANIKET",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "HHSPS4450Q",
                "total_amount": 95000
            },
            {
                "id": 333,
                "name": "HARDIK BUTANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "card_number": "DOSPB4620G",
                "total_amount": 45000
            },
            {
                "id": 334,
                "name": "PARTH SURESHBHAI SONANI",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IYWPS1075K",
                "total_amount": 95000
            },
            {
                "id": 335,
                "name": "KAKADIYA HITESH MAHESHBHAI",
                "group": "GOURAV",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DELPK8007R",
                "total_amount": 95000
            },
            {
                "id": 336,
                "name": "SUDHA DEVANI",
                "group": "NIRMAL",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "EGIPD6636R",
                "total_amount": 95000
            },
            {
                "id": 337,
                "name": "ASHOK PUROHIT",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BOGPP5927N",
                "total_amount": 95000
            },
            {
                "id": 338,
                "name": "PRATIKSHABEN H KACHHADIYA",
                "group": "RAJUBHAI",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "KWKPK5567E",
                "total_amount": 95000
            },
            {
                "id": 339,
                "name": "BHESAL HARSH",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 35000,
                "card_number": "EPJPB0825L",
                "total_amount": 80000
            },
            {
                "id": 340,
                "name": "PARMAR JAYSUKHBHAI NAGJIBHAI",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "CMRPP3630C",
                "total_amount": 95000
            },
            {
                "id": 341,
                "name": "PIYUSH KHUNT",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "BAIPH6758R",
                "total_amount": 95000
            },
            {
                "id": 342,
                "name": "PUSHPABEN KANTHARIYA",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "DPTPK2057C",
                "total_amount": 95000
            },
            {
                "id": 343,
                "name": "SANJAY PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "GPPPP4517F",
                "total_amount": 95000
            },
            {
                "id": 344,
                "name": "SHARAD SHAMBHAJI PATIL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "FQPPP2861E",
                "total_amount": 95000
            },
            {
                "id": 345,
                "name": "SUVAGIYA NANDLAL",
                "group": "PRATIK",
                "tds_amount1": 45000,
                "tds_amount2": 50000,
                "card_number": "IZTPS8826Q",
                "total_amount": 95000
            },
            {
                "id": 346,
                "name": "BHAVIN NITINBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 45000,
                "tds_amount2": 0,
                "card_number": "CBCPN5753J",
                "total_amount": 45000
            },
            {
                "id": 347,
                "name": "DHARMENDRA MOKADBHAI VIRANI",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "BTVPV8369L",
                "total_amount": 50000
            },
            {
                "id": 348,
                "name": "MAMTABEN RAJUBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "BZZPN8791A",
                "total_amount": 50000
            },
            {
                "id": 349,
                "name": "PIYUSH VINUBHAI ANGHAN ",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "DDDPA0491N",
                "total_amount": 50000
            },
            {
                "id": 350,
                "name": "RAJESHBHAI VALLABHBHAI NAVADIYA",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "BFBPN2571Q",
                "total_amount": 50000
            },
            {
                "id": 351,
                "name": "REKHABEN BHOLABHAI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "CMQPG0604L",
                "total_amount": 50000
            },
            {
                "id": 352,
                "name": "SURBHI GODHANI",
                "group": "ASHISH",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "BXDPV4558B",
                "total_amount": 50000
            },
            {
                "id": 353,
                "name": "BRIJESH DESAI",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "FPYPD0762J",
                "total_amount": 50000
            },
            {
                "id": 354,
                "name": "DIVYESH SUDANI",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "DGCPG5207E",
                "total_amount": 50000
            },
            {
                "id": 355,
                "name": "GHANSHYAM SUDANI",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "FQIPS1758A",
                "total_amount": 50000
            },
            {
                "id": 356,
                "name": "JAYDEEP BAVADIYA",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "BCBPB5431L",
                "total_amount": 50000
            },
            {
                "id": 357,
                "name": "RAMILA SUDANI",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "LCCPS8376N",
                "total_amount": 50000
            },
            {
                "id": 358,
                "name": "SACHIN HIRPARA",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "ANBPH5642K",
                "total_amount": 50000
            },
            {
                "id": 359,
                "name": "VIMAL LATHIYA",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "ANCPL2267M",
                "total_amount": 50000
            },
            {
                "id": 360,
                "name": "DESAI GAUTAM",
                "group": "NIRMAL",
                "tds_amount1": 50000,
                "tds_amount2": 0,
                "card_number": "DUXPD9928N",
                "total_amount": 50000
            },
            {
                "id": 361,
                "name": "ARUNABEN MUNGALPURA",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "BSWPM9105M",
                "total_amount": 55000
            },
            {
                "id": 362,
                "name": "ASHABEN ASHOKBHAI MULANI",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "GGWPM8488N",
                "total_amount": 55000
            },
            {
                "id": 363,
                "name": "BHARATBHAI MANGUKIYA",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "DCLPM3095K",
                "total_amount": 55000
            },
            {
                "id": 364,
                "name": "NATUBHAI NANJIBHAI DESAI",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "DRWPD7337H",
                "total_amount": 55000
            },
            {
                "id": 365,
                "name": "DHRUVIN SURESHBHAI MAVANI",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "DGVPM0646G",
                "total_amount": 55000
            },
            {
                "id": 366,
                "name": "ASHISH NARSHIBHAI ITALIYA",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "ACHPI6252R",
                "total_amount": 55000
            },
            {
                "id": 367,
                "name": "YASH SURESHBHAI MAVANI",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "ELEPM7836M",
                "total_amount": 55000
            },
            {
                "id": 368,
                "name": "NIRAV SURESHBHAI ZALAVADIYA",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "ABYPZ0050C",
                "total_amount": 55000
            },
            {
                "id": 369,
                "name": "PANKHIL BHARATBHAI MANGUKIYA",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "DFRPM9272M",
                "total_amount": 55000
            },
            {
                "id": 370,
                "name": "SURESHBHAI VALLABHBHAI MAVANI",
                "group": "PRATIK",
                "tds_amount1": 55000,
                "tds_amount2": 0,
                "card_number": "BXIPM3391Q",
                "total_amount": 55000
            },
            {
                "id": 371,
                "name": "RAVINABEN SARDHARA",
                "group": "JAYDIP",
                "tds_amount1": 95000,
                "tds_amount2": 0,
                "card_number": "DQQPS3954G",
                "total_amount": 95000
            },
            {
                "id": 372,
                "name": "ASHMITABEN SAVANI",
                "group": "ANIKET",
                "tds_amount1": 149930,
                "tds_amount2": 0,
                "card_number": "ONGPS2572L",
                "total_amount": 149930
            },
            {
                "id": 373,
                "name": "JAYSHREE SAKDASRIYA",
                "group": "ANIKET",
                "tds_amount1": 99850,
                "tds_amount2": 0,
                "card_number": "NGNPS0660C",
                "total_amount": 99850
            },
            {
                "id": 374,
                "name": "JAYDEEP GHEVARIYA",
                "group": "ANIKET",
                "tds_amount1": 100160,
                "tds_amount2": 0,
                "card_number": "DFWPG9878C",
                "total_amount": 100160
            },
            {
                "id": 375,
                "name": "HETVI CHOVATIYA",
                "group": "ANIKET",
                "tds_amount1": 100140,
                "tds_amount2": 0,
                "card_number": "CFCPC7186L",
                "total_amount": 100140
            },
            {
                "id": 376,
                "name": "VAISHALIBEN DAVARIYA",
                "group": "GOVRAV",
                "tds_amount1": 100420,
                "tds_amount2": 0,
                "card_number": "EUJPD0913C",
                "total_amount": 100420
            },
            {
                "id": 377,
                "name": "DEVANSHU PATEL",
                "group": "NANDAN",
                "tds_amount1": 100270,
                "tds_amount2": 0,
                "card_number": "BXYPP2373R",
                "total_amount": 100270
            },
            {
                "id": 378,
                "name": "TWINKLEBEN DHAMELIYA",
                "group": "NANDAN",
                "tds_amount1": 100250,
                "tds_amount2": 0,
                "card_number": "CKSPD1830K",
                "total_amount": 100250
            },
            {
                "id": 379,
                "name": "SAGAR GAJJAR",
                "group": "NIRMAL",
                "tds_amount1": 149780,
                "tds_amount2": 0,
                "card_number": "BKMPG4173M",
                "total_amount": 149780
            },
            {
                "id": 380,
                "name": "DAYABEN DEVANI",
                "group": "NIRMAL",
                "tds_amount1": 150370,
                "tds_amount2": 0,
                "card_number": "HTMPD9421A",
                "total_amount": 150370
            },
            {
                "id": 381,
                "name": "VIPUL M PATEL",
                "group": "NIRMAL",
                "tds_amount1": 100330,
                "tds_amount2": 0,
                "card_number": "AQIPP8500A",
                "total_amount": 100330
            },
            {
                "id": 382,
                "name": "JAYDEEP SARDHARA",
                "group": "JAYDIP",
                "tds_amount1": 99760,
                "tds_amount2": 0,
                "card_number": "CWHPA8216K",
                "total_amount": 99760
            },
            {
                "id": 383,
                "name": "KAUSHAL ATUL SHAH",
                "group": "JAYDIP",
                "tds_amount1": 99750,
                "tds_amount2": 0,
                "card_number": "KLUPS9472P",
                "total_amount": 99750
            },
            {
                "id": 384,
                "name": "RAJUBHAI BADRI TATI",
                "group": "PRATIK",
                "tds_amount1": 89132.22222222222,
                "tds_amount2": 0,
                "card_number": "BQEPT5565L",
                "total_amount": 89132.22222222222
            },
            {
                "id": 385,
                "name": "HARSIT R KOTADIYA",
                "group": "ASHISH",
                "tds_amount1": 60110,
                "tds_amount2": 0,
                "card_number": "IPIPK3392L",
                "total_amount": 60110
            },
            {
                "id": 386,
                "name": "RASHMIN M DONDA",
                "group": "ASHISH",
                "tds_amount1": 99240,
                "tds_amount2": 0,
                "card_number": "GMFPD0940B",
                "total_amount": 99240
            },
            {
                "id": 387,
                "name": "RITESH PATEL",
                "group": "ASHISH",
                "tds_amount1": 100540,
                "tds_amount2": 0,
                "card_number": "BUBPP7497N",
                "total_amount": 100540
            }
        ]

        await Promise.all(userData.map(async (user) => {
            const newCard = new Card({
                id: user.id,
                name: user.name,
                card_number: user.card_number,
                group: user.group,
                tds_amount1: user.tds_amount1,
                tds_amount2: user.tds_amount2,
                total_amount: user.total_amount
            })

            const card = await newCard.save()
        }))

        return res.send(prepareSuccessResponse({}, "Cards saved successfully"))
    } catch (e) {
        return res.send(e)
    }
}

exports.removeCaptchaError = async (req, res) => {
    try {
        let cards = await Card.find({mode_of_payment: "click to refresh image"}).select("_id")

        await Promise.all(cards.map(async (card) => {
            await Card.findByIdAndUpdate(card._id, {mode_of_payment: "",reference_number :"", is_synced: 0})
        }))

        return res.send(prepareSuccessResponse({}, "Cards updated successfully"))
    } catch (e) {
        return res.send(e)
    }
}
