const puppeteer = require('puppeteer');
const Card = require('../models/card')

(async () => {
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    await page.setViewport({width: 1200, height: 720});
    await page.goto('https://tin.tin.nsdl.com/oltas/refund-status-pan.html', {
        waitUntil: 'networkidle2',
    });

   // fetching card details
    let card = await Card.findOne({card_number: "CKSPD1830K"});

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

    let imageName = cardNumber + "-" + Date.now() + ".png"

    await page.screenshot({'path': `../images/${imageName}`, 'clip': {'x': x, 'y': y, 'width': w, 'height': h}});

    while (true) {
        let captchaCode = await Card.findOne({card_number: cardNumber});
        if (captchaCode) {
            break;
        }
    }


    // Need to pass Captcha


    await browser.close();
})();
