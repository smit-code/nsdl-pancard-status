//Enable stealth mode
const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')
puppeteer.use(StealthPlugin())
const randomUseragent = require('random-useragent');

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
    const cards = await Card.find().sort("id")
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

    const cards = await Card.find({is_synced: 0, is_dispatched: 0}).sort("id").limit(8);
    if (!cards) {
        console.log('Cards not found')
    }

    console.log("In")
    await Promise.all(await cards.map(async (card) => {
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
    }))

    console.log("Out")

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
                "id": "1",
                "name": "RAMABEN RAJESHBHAI CHOVATIYA",
                "card_number": "AQMPC7370D",
                "bill_amount": "755200",
                "tds_rate": "10",
                "tds_amount": "75520",
                "group": "NANDAN"
            },
            {
                "id": "2",
                "name": "GHANSHYAMBHAI DHARAMSHIBHAI KUKADIYA",
                "card_number": "AFXPK3818C",
                "bill_amount": "730100",
                "tds_rate": "10",
                "tds_amount": "73010",
                "group": "NANDAN"
            },
            {
                "id": "3",
                "name": "VASANTBEN GHANSHYAMBHAI KUKADIYA",
                "card_number": "GWHPK7060K",
                "bill_amount": "550100",
                "tds_rate": "2",
                "tds_amount": "11002",
                "group": "NANDAN"
            },
            {
                "id": "4",
                "name": "SURBHI VIVEK GODHANI",
                "card_number": "BXDPV4558B",
                "bill_amount": "475200",
                "tds_rate": "10",
                "tds_amount": "47520",
                "group": "ASHISH"
            },
            {
                "id": "5",
                "name": "BHAVIN NITINBHAI NAVADIYA",
                "card_number": "CBCPN5753J",
                "bill_amount": "570800",
                "tds_rate": "10",
                "tds_amount": "57080",
                "group": "ASHISH"
            },
            {
                "id": "6",
                "name": "RAJESHBHAI VALLABHBHAI NAVADIYA",
                "card_number": "BFBPN2571Q",
                "bill_amount": "510900",
                "tds_rate": "2",
                "tds_amount": "10218",
                "group": "ASHISH"
            },
            {
                "id": "7",
                "name": "MAMTABEN RAJUBHAI NAVADIYA",
                "card_number": "BZZPN8791A",
                "bill_amount": "455300",
                "tds_rate": "1",
                "tds_amount": "4553",
                "group": "ASHISH"
            },
            {
                "id": "8",
                "name": "DHAVAL VIRANI",
                "card_number": "BTVPV8369L",
                "bill_amount": "560100",
                "tds_rate": "10",
                "tds_amount": "56010",
                "group": "ASHISH"
            },
            {
                "id": "9",
                "name": "PIYUSH VINUBHAI ANGHAN",
                "card_number": "DDDPA0491N",
                "bill_amount": "490900",
                "tds_rate": "10",
                "tds_amount": "49090",
                "group": "ASHISH"
            },
            {
                "id": "10",
                "name": "ASHOKBHAI DEVJIBHAI ANGHAN",
                "card_number": "BYKPA0835J",
                "bill_amount": "595300",
                "tds_rate": "2",
                "tds_amount": "11906",
                "group": "ASHISH"
            },
            {
                "id": "11",
                "name": "JIGNESH VINUBHAI ANGHAN",
                "card_number": "BNZPA6796A",
                "bill_amount": "580400",
                "tds_rate": "1",
                "tds_amount": "5804",
                "group": "ASHISH"
            },
            {
                "id": "12",
                "name": "USHABEN DINESHBHAI NAVADIYA",
                "card_number": "AWVPN6017H",
                "bill_amount": "485300",
                "tds_rate": "10",
                "tds_amount": "48530",
                "group": "ASHISH"
            },
            {
                "id": "13",
                "name": "NITINBHAI VALLABHBHAI NAVADIYA",
                "card_number": "BORPN2943H",
                "bill_amount": "389900",
                "tds_rate": "2",
                "tds_amount": "7798",
                "group": "ASHISH"
            },
            {
                "id": "14",
                "name": "SAGAR NARESHBHAI NAVADIYA",
                "card_number": "BNQPN0409Q",
                "bill_amount": "555600",
                "tds_rate": "1",
                "tds_amount": "5556",
                "group": "ASHISH"
            },
            {
                "id": "15",
                "name": "PIYUSH DHANJIBHAI VIRANI",
                "card_number": "AUSPV4099A",
                "bill_amount": "490900",
                "tds_rate": "2",
                "tds_amount": "9818",
                "group": "ASHISH"
            },
            {
                "id": "16",
                "name": "REKHABEN BHOLABHAI GODHANI",
                "card_number": "CMQPG0604L",
                "bill_amount": "535300",
                "tds_rate": "10",
                "tds_amount": "53530",
                "group": "ASHISH"
            },
            {
                "id": "17",
                "name": "VIVEK PRAFULCHANDRA UNADKAT",
                "card_number": "AEIPU1545E",
                "bill_amount": "530200",
                "tds_rate": "10",
                "tds_amount": "53020",
                "group": "NANDAN"
            },
            {
                "id": "18",
                "name": "BHARATBHAI DHARAMSHIBHAI SAKDASARIYA",
                "card_number": "ETIPS9012M",
                "bill_amount": "390300",
                "tds_rate": "10",
                "tds_amount": "39030",
                "group": "ANIKET"
            },
            {
                "id": "19",
                "name": "NITINBHAI NANUBHAI VAGHANI",
                "card_number": "APGPV8892Q",
                "bill_amount": "510500",
                "tds_rate": "10",
                "tds_amount": "51050",
                "group": "ANIKET"
            },
            {
                "id": "20",
                "name": "SANKET KANJIBHAI CHABHADIYA",
                "card_number": "AVHPC6393A",
                "bill_amount": "515300",
                "tds_rate": "10",
                "tds_amount": "51530",
                "group": "ANIKET"
            },
            {
                "id": "21",
                "name": "VIRAM RAMJIBHAI ITALIYA",
                "card_number": "ACYPI8295H",
                "bill_amount": "425700",
                "tds_rate": "10",
                "tds_amount": "42570",
                "group": "ANIKET"
            },
            {
                "id": "22",
                "name": "MITTALBEN BHARATBHAI SAKDASARIYA",
                "card_number": "IWNPS1876K",
                "bill_amount": "740200",
                "tds_rate": "2",
                "tds_amount": "14804",
                "group": "ANIKET"
            },
            {
                "id": "23",
                "name": "BHARATIBEN BHARATBHAI SAKDASARIYA",
                "card_number": "JWNPS1777Q",
                "bill_amount": "490600",
                "tds_rate": "1",
                "tds_amount": "4906",
                "group": "ANIKET"
            },
            {
                "id": "24",
                "name": "BANSIBEN MAULIKBHAI SHANKAR",
                "card_number": "ERSPK3676R",
                "bill_amount": "555200",
                "tds_rate": "1",
                "tds_amount": "5552",
                "group": "AKASH"
            },
            {
                "id": "25",
                "name": "PIYUSHKUMAR DINESHBHAI SUHAGIYA",
                "card_number": "GIKPS4452L",
                "bill_amount": "490100",
                "tds_rate": "10",
                "tds_amount": "49010",
                "group": "NIRMAL"
            },
            {
                "id": "26",
                "name": "SONALBEN CHANDRESHBHAI PARMAR",
                "card_number": "CWJPP4338P",
                "bill_amount": "530500",
                "tds_rate": "2",
                "tds_amount": "10610",
                "group": "NIRMAL"
            },
            {
                "id": "27",
                "name": "DAYABEN MUKESHBHAI KORAT",
                "card_number": "BMRPK6899K",
                "bill_amount": "480800",
                "tds_rate": "10",
                "tds_amount": "48080",
                "group": "NIRMAL"
            },
            {
                "id": "28",
                "name": "NIMESH JAYESHBHAI DUDHAT",
                "card_number": "CDOPD8631H",
                "bill_amount": "560400",
                "tds_rate": "2",
                "tds_amount": "11208",
                "group": "NIRMAL"
            },
            {
                "id": "29",
                "name": "BHOOMIBEN BATUKBHAI SAVAJ",
                "card_number": "IHOPS3854R",
                "bill_amount": "540300",
                "tds_rate": "5",
                "tds_amount": "27015",
                "group": "NIRMAL"
            },
            {
                "id": "30",
                "name": "BHAVNABEN BATUKBHAI SAVAJ",
                "card_number": "HQQPS4519M",
                "bill_amount": "550700",
                "tds_rate": "10",
                "tds_amount": "55070",
                "group": "NIRMAL"
            },
            {
                "id": "31",
                "name": "VEKARIYA DEVANGI VIPULBHAI",
                "card_number": "CCCPV6161M",
                "bill_amount": "445900",
                "tds_rate": "2",
                "tds_amount": "8918",
                "group": "NIRMAL"
            },
            {
                "id": "32",
                "name": "VIPULBHAI MANUBHAI PATEL",
                "card_number": "AQIPP8500A",
                "bill_amount": "498000",
                "tds_rate": "5",
                "tds_amount": "24900",
                "group": "NIRMAL"
            },
            {
                "id": "33",
                "name": "VEKARIYA URMILABEN VIPULBHAI",
                "card_number": "AVSPV5410G",
                "bill_amount": "528500",
                "tds_rate": "10",
                "tds_amount": "52850",
                "group": "NIRMAL"
            },
            {
                "id": "34",
                "name": "SHREYANSH NATUBHAI DEVANI",
                "card_number": "BYYPD4163N",
                "bill_amount": "532700",
                "tds_rate": "10",
                "tds_amount": "53270",
                "group": "NIRMAL"
            },
            {
                "id": "35",
                "name": "ZALAVADIYA BHUMIKA MUKESHBHAI",
                "card_number": "ADPPZ5253N",
                "bill_amount": "496800",
                "tds_rate": "5",
                "tds_amount": "24840",
                "group": "NIRMAL"
            },
            {
                "id": "36",
                "name": "KHOKAR HITESH RAMESHBHAI",
                "card_number": "ERMPK0324L",
                "bill_amount": "536200",
                "tds_rate": "1",
                "tds_amount": "5362",
                "group": "NIMESH"
            },
            {
                "id": "37",
                "name": "MUKESH THANAJI RAWAL",
                "card_number": "AZEPR1884Q",
                "bill_amount": "550200",
                "tds_rate": "1",
                "tds_amount": "5502",
                "group": "NIMESH"
            },
            {
                "id": "38",
                "name": "KEYURKUMAR BHAVINBHAI LAKHANI",
                "card_number": "BHMPL2708J",
                "bill_amount": "498300",
                "tds_rate": "1",
                "tds_amount": "4983",
                "group": "NIMESH"
            },
            {
                "id": "39",
                "name": "KULDEEPSINH RATHOD",
                "card_number": "BPPPG0169B",
                "bill_amount": "530100",
                "tds_rate": "1",
                "tds_amount": "5301",
                "group": "ANIKET"
            },
            {
                "id": "40",
                "name": "LAKHAN KUMAR",
                "card_number": "FRDPK7894D",
                "bill_amount": "560600",
                "tds_rate": "1",
                "tds_amount": "5606",
                "group": "ANIKET"
            },
            {
                "id": "41",
                "name": "PUSHPRAJ KUMAR",
                "card_number": "INWPK7633E",
                "bill_amount": "525000",
                "tds_rate": "1",
                "tds_amount": "5250",
                "group": "ANIKET"
            },
            {
                "id": "42",
                "name": "SHITALBA KULDEEPSINH RATHOD",
                "card_number": "DPVPG5964N",
                "bill_amount": "495100",
                "tds_rate": "1",
                "tds_amount": "4951",
                "group": "ANIKET"
            },
            {
                "id": "43",
                "name": "NARAYAN MAHATO",
                "card_number": "DKEPM1721H",
                "bill_amount": "530800",
                "tds_rate": "1",
                "tds_amount": "5308",
                "group": "ANIKET"
            },
            {
                "id": "44",
                "name": "SUNITA DANBAHADUR BISTA",
                "card_number": "FXTPB8635P",
                "bill_amount": "520700",
                "tds_rate": "1",
                "tds_amount": "5207",
                "group": "ANIKET"
            },
            {
                "id": "45",
                "name": "NIMESH PRAGJIBHAI DIYORA",
                "card_number": "DWUPD1233B",
                "bill_amount": "536900",
                "tds_rate": "2",
                "tds_amount": "10738",
                "group": "NIMESH"
            },
            {
                "id": "46",
                "name": "AXIT DINESHBHAI PAVASIYA",
                "card_number": "DTIPP6086H",
                "bill_amount": "545500",
                "tds_rate": "2",
                "tds_amount": "10910",
                "group": "NIMESH"
            },
            {
                "id": "47",
                "name": "KHEMRAJ KUMAR",
                "card_number": "GNLPK3734H",
                "bill_amount": "522300",
                "tds_rate": "1",
                "tds_amount": "5223",
                "group": "ANIKET"
            },
            {
                "id": "48",
                "name": "NILESHBHAI MANSUKHBHAI DEVANI",
                "card_number": "AKKPD0573B",
                "bill_amount": "510600",
                "tds_rate": "5",
                "tds_amount": "25530",
                "group": "NIRMAL"
            },
            {
                "id": "49",
                "name": "KHASIYA AVINASH MAHESHBHAI",
                "card_number": "KYBPK9167K",
                "bill_amount": "480700",
                "tds_rate": "5",
                "tds_amount": "24035",
                "group": "JOYAN"
            },
            {
                "id": "50",
                "name": "NATUBHAI DAYABHAI DEVANI",
                "card_number": "BMYPD3242C",
                "bill_amount": "575900",
                "tds_rate": "2",
                "tds_amount": "11518",
                "group": "NIRMAL"
            },
            {
                "id": "51",
                "name": "PARESH PANSARA",
                "card_number": "BPAPP5831A",
                "bill_amount": "540300",
                "tds_rate": "10",
                "tds_amount": "54030",
                "group": "NIRMAL"
            },
            {
                "id": "52",
                "name": "CHAVADA SATYAM MANSUKHBHAI",
                "card_number": "BZCPC0814J",
                "bill_amount": "498500",
                "tds_rate": "5",
                "tds_amount": "24925",
                "group": "DHARMIK"
            },
            {
                "id": "53",
                "name": "THUMMAR JENISH KANAKBHAI",
                "card_number": "CEIPT2746A",
                "bill_amount": "565400",
                "tds_rate": "2",
                "tds_amount": "11308",
                "group": "RAJUBHAI"
            },
            {
                "id": "54",
                "name": "BHARATBHAI MANILAL KHANPARA HUF",
                "card_number": "AAKHB2895L",
                "bill_amount": "510500",
                "tds_rate": "2",
                "tds_amount": "10210",
                "group": "AKASH"
            },
            {
                "id": "55",
                "name": "KHUNT URVASHI BHAVIK",
                "card_number": "LSVPK7198D",
                "bill_amount": "535700",
                "tds_rate": "10",
                "tds_amount": "53570",
                "group": "NANDAN"
            },
            {
                "id": "56",
                "name": "KATHIRIYA TARANG RAMESHBHAI",
                "card_number": "EYFPR9485D",
                "bill_amount": "545900",
                "tds_rate": "5",
                "tds_amount": "27295",
                "group": "DHARMIK"
            },
            {
                "id": "57",
                "name": "ARVINBHAI MOHANBHAI MORADIYA",
                "card_number": "DPZPM4636B",
                "bill_amount": "625000",
                "tds_rate": "1",
                "tds_amount": "6250",
                "group": "ASHISH"
            },
            {
                "id": "58",
                "name": "DABHI CHANDUBHAI PANCHABHAI",
                "card_number": "CMNPD7128P",
                "bill_amount": "505000",
                "tds_rate": "10",
                "tds_amount": "50500",
                "group": "ASHISH"
            },
            {
                "id": "59",
                "name": "DOBARIYA H KANUBHAI",
                "card_number": "FBNPD0606N",
                "bill_amount": "515000",
                "tds_rate": "10",
                "tds_amount": "51500",
                "group": "ASHISH"
            },
            {
                "id": "60",
                "name": "KOTADIYA HARSHITKUMAR RAJESHBHAI",
                "card_number": "IPIPK3392L",
                "bill_amount": "510000",
                "tds_rate": "10",
                "tds_amount": "51000",
                "group": "ASHISH"
            },
            {
                "id": "61",
                "name": "SHELADIYA HETAL GOPALBHAI",
                "card_number": "DFHPS4452B",
                "bill_amount": "505000",
                "tds_rate": "10",
                "tds_amount": "50500",
                "group": "ASHISH"
            },
            {
                "id": "62",
                "name": "JAYESHKUMAR GOPALBHAI SHELDIYA",
                "card_number": "GVUPS2176C",
                "bill_amount": "514000",
                "tds_rate": "10",
                "tds_amount": "51400",
                "group": "ASHISH"
            },
            {
                "id": "63",
                "name": "KANUBHAI VALJIBHAI DOBARIYA",
                "card_number": "AMMPD0257G",
                "bill_amount": "518000",
                "tds_rate": "10",
                "tds_amount": "51800",
                "group": "ASHISH"
            },
            {
                "id": "64",
                "name": "DABHI VAIBHAV CHANDUBHAI",
                "card_number": "FDSPD3445L",
                "bill_amount": "508000",
                "tds_rate": "10",
                "tds_amount": "50800",
                "group": "ASHISH"
            },
            {
                "id": "65",
                "name": "ABHISHEK DAYALJIBHAI CHAUHAN",
                "card_number": "BVUPC3741A",
                "bill_amount": "435000",
                "tds_rate": "10",
                "tds_amount": "43500",
                "group": "NIRMAL"
            },
            {
                "id": "66",
                "name": "HARDIK ANILBHAI MAKVANA",
                "card_number": "CRLPM8189G",
                "bill_amount": "440000",
                "tds_rate": "10",
                "tds_amount": "44000",
                "group": "NIRMAL"
            },
            {
                "id": "67",
                "name": "DOBARIYA KHUSHAL KIRITBHAI",
                "card_number": "BMHPD7584C",
                "bill_amount": "635000",
                "tds_rate": "10",
                "tds_amount": "63500",
                "group": "NIRMAL"
            },
            {
                "id": "68",
                "name": "BAVADIYA JAYDEEP PRAKASHBHAI",
                "card_number": "BCBPB5431L",
                "bill_amount": "648000",
                "tds_rate": "10",
                "tds_amount": "64800",
                "group": "NIRMAL"
            },
            {
                "id": "69",
                "name": "KRISHNA SURESHBHAI BHIMANI",
                "card_number": "DVCPB2259C",
                "bill_amount": "652000",
                "tds_rate": "10",
                "tds_amount": "65200",
                "group": "NIRMAL"
            },
            {
                "id": "70",
                "name": "NIRMAL MUKESHBHAI ZALAVADIA",
                "card_number": "ABFPZ4404M",
                "bill_amount": "573400",
                "tds_rate": "1",
                "tds_amount": "5734",
                "group": "NIRMAL"
            },
            {
                "id": "71",
                "name": "BHARGAV BHANUBHAI RADADIYA",
                "card_number": "DQAPR7902B",
                "bill_amount": "645800",
                "tds_rate": "1",
                "tds_amount": "6458",
                "group": "NIRMAL"
            },
            {
                "id": "72",
                "name": "MAYURKUMAR BATUKBHAI",
                "card_number": "DXVPS4471L",
                "bill_amount": "624500",
                "tds_rate": "1",
                "tds_amount": "6245",
                "group": "NIRMAL"
            },
            {
                "id": "73",
                "name": "KHOKHAR HANSABEN KALUBHAI",
                "card_number": "DOKPK4583M",
                "bill_amount": "508500",
                "tds_rate": "10",
                "tds_amount": "50850",
                "group": "RAJUBHAI"
            },
            {
                "id": "74",
                "name": "KHOKHAR NILAMBAHEN RAJESHKUMAR",
                "card_number": "DUBPK0947Q",
                "bill_amount": "518400",
                "tds_rate": "10",
                "tds_amount": "51840",
                "group": "RAJUBHAI"
            },
            {
                "id": "75",
                "name": "KALUBHAI DEVJIBHAI KHOKHAR",
                "card_number": "ABQPK7937D",
                "bill_amount": "503500",
                "tds_rate": "10",
                "tds_amount": "50350",
                "group": "RAJUBHAI"
            },
            {
                "id": "76",
                "name": "DHARMESH SURESHBHAI ZADAFIYA",
                "card_number": "ABCPZ8199G",
                "bill_amount": "630000",
                "tds_rate": "1",
                "tds_amount": "6300",
                "group": "JOYAN"
            },
            {
                "id": "77",
                "name": "PARAS DINESHBHAI CHUDASAMA",
                "card_number": "CKIPC1801K",
                "bill_amount": "625000",
                "tds_rate": "1",
                "tds_amount": "6250",
                "group": "JOYAN"
            },
            {
                "id": "78",
                "name": "MUKESHBHAI NATHUBHAI KORAT",
                "card_number": "AOGPK7204L",
                "bill_amount": "684200",
                "tds_rate": "1",
                "tds_amount": "6842",
                "group": "NIRMAL"
            },
            {
                "id": "79",
                "name": "KEVADIYA VIKAS BHARATBHAI",
                "card_number": "EMFPK2117H",
                "bill_amount": "694500",
                "tds_rate": "1",
                "tds_amount": "6945",
                "group": "NIRMAL"
            },
            {
                "id": "80",
                "name": "ANKIT MUKESHBHAI VAGHASIYA",
                "card_number": "AVYPV1839K",
                "bill_amount": "678500",
                "tds_rate": "1",
                "tds_amount": "6785",
                "group": "NIRMAL"
            },
            {
                "id": "81",
                "name": "PRAVIN MANSUKHBHAI DEVANI",
                "card_number": "ARLPD3334J",
                "bill_amount": "685700",
                "tds_rate": "1",
                "tds_amount": "6857",
                "group": "NIRMAL"
            },
            {
                "id": "82",
                "name": "JASHUBEN GHANSHYAMBHAI GORASIYA",
                "card_number": "DUTPG3678A",
                "bill_amount": "678500",
                "tds_rate": "1",
                "tds_amount": "6785",
                "group": "ASHISH"
            },
            {
                "id": "83",
                "name": "ARTI C SUVAGIYA",
                "card_number": "GCRPS7483E",
                "bill_amount": "674500",
                "tds_rate": "1",
                "tds_amount": "6745",
                "group": "NIRMAL"
            },
            {
                "id": "84",
                "name": "DESAI GAUTAM GHANSHYAMBHAI",
                "card_number": "DUXPD9928N",
                "bill_amount": "684000",
                "tds_rate": "1",
                "tds_amount": "6840",
                "group": "NIRMAL"
            },
            {
                "id": "85",
                "name": "DESAI BIRJESH GHANSHYAMBHAI",
                "card_number": "FPYPD0762J",
                "bill_amount": "657500",
                "tds_rate": "1",
                "tds_amount": "6575",
                "group": "NIRMAL"
            },
            {
                "id": "86",
                "name": "SUDANI RAMILABEN GHANSHYAMBHAI",
                "card_number": "LCCPS8376N",
                "bill_amount": "668500",
                "tds_rate": "10",
                "tds_amount": "66850",
                "group": "NIRMAL"
            },
            {
                "id": "87",
                "name": "GHANSHYAMBHAI SHAMJIBHAI SUDANI",
                "card_number": "FQIPS1758A",
                "bill_amount": "682000",
                "tds_rate": "1",
                "tds_amount": "6820",
                "group": "NIRMAL"
            },
            {
                "id": "88",
                "name": "SUDANI DIVYESH GHANSHYAMBHAI",
                "card_number": "DGCPG5207E",
                "bill_amount": "658700",
                "tds_rate": "1",
                "tds_amount": "6587",
                "group": "NIRMAL"
            },
            {
                "id": "89",
                "name": "LATHIYA VIMAL CHATURBHAI",
                "card_number": "ANCPL2267M",
                "bill_amount": "649500",
                "tds_rate": "1",
                "tds_amount": "6495",
                "group": "NIRMAL"
            },
            {
                "id": "90",
                "name": "JIGNESH RANCHHODBHAI VAGHELA",
                "card_number": "AQOPV3697A",
                "bill_amount": "677900",
                "tds_rate": "1",
                "tds_amount": "6779",
                "group": "NIRMAL"
            },
            {
                "id": "91",
                "name": "CHANDRESH HIMMATBHAI PARMAR",
                "card_number": "COFPP2206A",
                "bill_amount": "672500",
                "tds_rate": "2",
                "tds_amount": "13450",
                "group": "NIRMAL"
            },
            {
                "id": "92",
                "name": "PINALBAHEN JIVRAJBHAI LATHIYA",
                "card_number": "AQDPL2437R",
                "bill_amount": "657800",
                "tds_rate": "1",
                "tds_amount": "6578",
                "group": "ASHISH"
            },
            {
                "id": "93",
                "name": "SOLANKI BHAVNABEN RAJUBHAI",
                "card_number": "GNJPS0790B",
                "bill_amount": "654000",
                "tds_rate": "1",
                "tds_amount": "6540",
                "group": "ASHISH"
            },
            {
                "id": "94",
                "name": "KATRODIYA JAYABEN JAYANTIBHAI",
                "card_number": "EIBPK6862B",
                "bill_amount": "638500",
                "tds_rate": "1",
                "tds_amount": "6385",
                "group": "ASHISH"
            },
            {
                "id": "95",
                "name": "KATRODIYA JAYANTIBHAI PARSHOTAMBHAI",
                "card_number": "EIBPK7750J",
                "bill_amount": "674800",
                "tds_rate": "1",
                "tds_amount": "6748",
                "group": "ASHISH"
            },
            {
                "id": "96",
                "name": "HARDIK MAHESHBHAI DHAMELIYA",
                "card_number": "CKMPD2029Q",
                "bill_amount": "662000",
                "tds_rate": "1",
                "tds_amount": "6620",
                "group": "ASHISH"
            },
            {
                "id": "97",
                "name": "LABHUBEN  MAHESHBHAI DHAMELIYA",
                "card_number": "AMBPD2030J",
                "bill_amount": "673500",
                "tds_rate": "1",
                "tds_amount": "6735",
                "group": "ASHISH"
            },
            {
                "id": "98",
                "name": "ASHABEN PRAKASHBHAI DHAMELIYA",
                "card_number": "AZTPD2473J",
                "bill_amount": "665400",
                "tds_rate": "1",
                "tds_amount": "6654",
                "group": "ASHISH"
            },
            {
                "id": "99",
                "name": "PRAKASHBHAI VASHRAMBHAI DHAMELIYA",
                "card_number": "AMLPD9011D",
                "bill_amount": "662800",
                "tds_rate": "1",
                "tds_amount": "6628",
                "group": "ASHISH"
            },
            {
                "id": "100",
                "name": "MITVA DINESHBHAI DHAMELIYA",
                "card_number": "CTRPD6461N",
                "bill_amount": "658200",
                "tds_rate": "1",
                "tds_amount": "6582",
                "group": "ASHISH"
            },
            {
                "id": "101",
                "name": "SATISHKUMAR MERAMBHAI VANIYA",
                "card_number": "BGVPV9131M",
                "bill_amount": "654500",
                "tds_rate": "1",
                "tds_amount": "6545",
                "group": "ASHISH"
            },
            {
                "id": "102",
                "name": "JAYESH BABUBHAI KATARIYA",
                "card_number": "HMCPK8657N",
                "bill_amount": "679500",
                "tds_rate": "1",
                "tds_amount": "6795",
                "group": "ASHISH"
            },
            {
                "id": "103",
                "name": "MERAMBHAI NAGJIBHAI VANIYA",
                "card_number": "BDOPV6475L",
                "bill_amount": "672600",
                "tds_rate": "1",
                "tds_amount": "6726",
                "group": "ASHISH"
            },
            {
                "id": "104",
                "name": "HIRAPARA SACHIN MANSUKHBHAI",
                "card_number": "ANBPH5642K",
                "bill_amount": "656500",
                "tds_rate": "1",
                "tds_amount": "6565",
                "group": "NIRMAL"
            },
            {
                "id": "105",
                "name": "HARSHABEN MUKESHBHAI ZALAVADIYA HUF",
                "card_number": "AAGHH7280D",
                "bill_amount": "674200",
                "tds_rate": "1",
                "tds_amount": "6742",
                "group": "NIRMAL"
            },
            {
                "id": "106",
                "name": "CHIRAG HARESHBHAI DAKHARA",
                "card_number": "CNGPD0592M",
                "bill_amount": "660500",
                "tds_rate": "2",
                "tds_amount": "13210",
                "group": "NIRMAL"
            },
            {
                "id": "107",
                "name": "CHAMPABEN MANUBHAI BARVALIYA",
                "card_number": "ASDPB5371L",
                "bill_amount": "678400",
                "tds_rate": "2",
                "tds_amount": "13568",
                "group": "RAJUBHAI"
            },
            {
                "id": "108",
                "name": "KARTIK JAYSUKHBHAI CHOPDA",
                "card_number": "CAAPC7882C",
                "bill_amount": "668200",
                "tds_rate": "2",
                "tds_amount": "13364",
                "group": "ASHISH"
            },
            {
                "id": "109",
                "name": "CHOPDA HANSABEN CHANDUBHAI",
                "card_number": "CMHPC2738N",
                "bill_amount": "676100",
                "tds_rate": "1",
                "tds_amount": "6761",
                "group": "ASHISH"
            },
            {
                "id": "110",
                "name": "NIKUNJ HIMMATBHAI PATEL",
                "card_number": "CPNPP9290R",
                "bill_amount": "663700",
                "tds_rate": "1",
                "tds_amount": "6637",
                "group": "ASHISH"
            },
            {
                "id": "111",
                "name": "MEET DINESHBHAI MADALIYA",
                "card_number": "EWMPM1047P",
                "bill_amount": "658500",
                "tds_rate": "1",
                "tds_amount": "6585",
                "group": "ASHISH"
            },
            {
                "id": "112",
                "name": "KOLADIYA NIKUNJ ARVINDBHAI",
                "card_number": "HCNPK7955J",
                "bill_amount": "674300",
                "tds_rate": "1",
                "tds_amount": "6743",
                "group": "ASHISH"
            },
            {
                "id": "113",
                "name": "HIRAL HARESHBHAI KHUNT",
                "card_number": "FXPPK0017J",
                "bill_amount": "669200",
                "tds_rate": "2",
                "tds_amount": "13384",
                "group": "ASHISH"
            },
            {
                "id": "114",
                "name": "KHUNT JAYESH PRAVINBHAI",
                "card_number": "HDIPK5545N",
                "bill_amount": "654800",
                "tds_rate": "1",
                "tds_amount": "6548",
                "group": "ASHISH"
            },
            {
                "id": "115",
                "name": "URVISHA KANAKBHAI THUMMAR",
                "card_number": "BYZPT7935D",
                "bill_amount": "662500",
                "tds_rate": "2",
                "tds_amount": "13250",
                "group": "RAJUBHAI"
            },
            {
                "id": "116",
                "name": "ARVINDBHAI HIRJIBHAI SAVANI",
                "card_number": "BKKPS6221G",
                "bill_amount": "654800",
                "tds_rate": "1",
                "tds_amount": "6548",
                "group": "JOYAN"
            },
            {
                "id": "117",
                "name": "RINKESH YOGESHBHAI PAREKH",
                "card_number": "EEHPP4958B",
                "bill_amount": "786450",
                "tds_rate": "1",
                "tds_amount": "7864.5",
                "group": "ASHISH"
            },
            {
                "id": "118",
                "name": "PORIYA RONAK HARESHBHAI",
                "card_number": "DEMPP2375N",
                "bill_amount": "784690",
                "tds_rate": "1",
                "tds_amount": "7846.9",
                "group": "ASHISH"
            },
            {
                "id": "119",
                "name": "NIRAV NANNUBHAI",
                "card_number": "BVUPG7433B",
                "bill_amount": "783500",
                "tds_rate": "1",
                "tds_amount": "7835",
                "group": "ASHISH"
            },
            {
                "id": "120",
                "name": "UPADHYAY MOSAM KALPESHBHAI",
                "card_number": "AHDPU7698G",
                "bill_amount": "794800",
                "tds_rate": "1",
                "tds_amount": "7948",
                "group": "ASHISH"
            },
            {
                "id": "121",
                "name": "TRIVEDI REVANT RAHULKUMAR",
                "card_number": "BSHPT6731R",
                "bill_amount": "788200",
                "tds_rate": "1",
                "tds_amount": "7882",
                "group": "ANIKET JEMISH"
            },
            {
                "id": "122",
                "name": "VAISANAV HIMANSHU",
                "card_number": "APHPV6247G",
                "bill_amount": "792500",
                "tds_rate": "1",
                "tds_amount": "7925",
                "group": "VARDHMAN"
            },
            {
                "id": "123",
                "name": "NIMBARK POOJA",
                "card_number": "BZTPN3749J",
                "bill_amount": "785600",
                "tds_rate": "1",
                "tds_amount": "7856",
                "group": "VARDHMAN"
            },
            {
                "id": "124",
                "name": "RUSHI BHARATBHAI DAYANI",
                "card_number": "GDXPD5493J",
                "bill_amount": "779400",
                "tds_rate": "2",
                "tds_amount": "15588",
                "group": "NIMESH"
            },
            {
                "id": "125",
                "name": "MENDPARA URVIL",
                "card_number": "GBIPM0566C",
                "bill_amount": "784200",
                "tds_rate": "2",
                "tds_amount": "15684",
                "group": "NIMESH"
            },
            {
                "id": "126",
                "name": "DHARMIK NARESHBHAI SORATHIYA",
                "card_number": "MOEPS0818G",
                "bill_amount": "792500",
                "tds_rate": "1",
                "tds_amount": "7925",
                "group": "NIMESH"
            },
            {
                "id": "127",
                "name": "KOMALBEN J MIYANI",
                "card_number": "DHUPM4518R",
                "bill_amount": "534450",
                "tds_rate": "5",
                "tds_amount": "26722.5",
                "group": "VIRAM"
            },
            {
                "id": "128",
                "name": "DHRUV SAVANI",
                "card_number": "NLEPS9912P",
                "bill_amount": "542600",
                "tds_rate": "5",
                "tds_amount": "27130",
                "group": "ANIKET"
            },
            {
                "id": "129",
                "name": "CHANDRESH DOBARIYA",
                "card_number": "GYUPD1516E",
                "bill_amount": "540200",
                "tds_rate": "10",
                "tds_amount": "54020",
                "group": "VIRAM"
            },
            {
                "id": "130",
                "name": "JAYESH J BHATT",
                "card_number": "BKAPB4200L",
                "bill_amount": "536400",
                "tds_rate": "5",
                "tds_amount": "26820",
                "group": "AKASH"
            },
            {
                "id": "131",
                "name": "BHAVDEEP SAKADASARIYA",
                "card_number": "IGGPS3426A",
                "bill_amount": "536500",
                "tds_rate": "10",
                "tds_amount": "53650",
                "group": "GOPAL JASAPRA"
            },
            {
                "id": "132",
                "name": "USHABEN NAVADIYA",
                "card_number": "AWVPN6017H",
                "bill_amount": "510800",
                "tds_rate": "10",
                "tds_amount": "51080",
                "group": "ASHISH"
            },
            {
                "id": "133",
                "name": "BHARATBHAI MANILAL KHANPARA",
                "card_number": "DGQPK7571H",
                "bill_amount": "1280000",
                "tds_rate": "1",
                "tds_amount": "12800",
                "group": "AKASH"
            },
            {
                "id": "134",
                "name": "HIMANI JASH UKANI",
                "card_number": "CZRPG1934M",
                "bill_amount": "1265000",
                "tds_rate": "1",
                "tds_amount": "12650",
                "group": "ANIKET"
            },
            {
                "id": "135",
                "name": "IRAG HIMMATBHAI DOBARIYA",
                "card_number": "BLQPD2477Q",
                "bill_amount": "1270000",
                "tds_rate": "1",
                "tds_amount": "12700",
                "group": "VIRAM"
            },
            {
                "id": "136",
                "name": "NIKUNJ SANJAYBHAI GOYANI",
                "card_number": "CZMPG7003E",
                "bill_amount": "1260000",
                "tds_rate": "1",
                "tds_amount": "12600",
                "group": "ANIKET"
            }
        ]

        await Promise.all(userData.map(async (user) => {
            const newCard = new Card({
                id: user.id,
                name: user.name,
                card_number: user.card_number,
                group: user.group,
                bill_amount: user.bill_amount,
                tds_rate: user.tds_rate,
                tds_amount: user.tds_amount
            })

            const card = await newCard.save()
        }))

        return res.send(prepareSuccessResponse({}, "Cards saved successfully"))
    } catch (e) {
        return res.send(e)
    }
}
