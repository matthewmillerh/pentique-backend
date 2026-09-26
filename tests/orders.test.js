// Run from the server directory: NODE_ENV=development npm test
// Checks the order and contact forms and the emails they make. Nothing is sent: without SMTP settings the emails
// are written to a temporary folder. Reads products from the dev database, and adds (then removes) one hidden one.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import db from '../config/database.js'
import { createCategory } from '../models/categoryModel.js'
import { addProduct } from '../models/productModel.js'
import { placeOrderController, sendContactController } from '../controllers/orders.js'
import { renderEmail } from '../emails/render.js'
import { rateLimit } from '../utils/rateLimit.js'
import {
    buildOrderEmailData,
    contactEmailData,
    customerOrderData,
    newOrderReference,
    shopOrderData,
    validateContact,
    validateOrder,
} from '../utils/orders.js'

const validOrder = (fields = {}) => ({
    name: 'Jane Doe',
    email: 'jane@example.com',
    tel: '082 555 0134',
    delivery: 'collect',
    note: '',
    items: [{ productID: 1, quantity: 2 }],
    ...fields,
})

describe('order form checks', () => {
    test('accepts a complete order and tidies it up', () => {
        const { value } = validateOrder(
            validOrder({
                name: '  Jane \n  Doe ',
                items: [{ productID: '7', quantity: '2' }, { productID: 7, quantity: 3 }, { productID: 8, quantity: 1 }],
                note: 'Line one\r\n\r\n\r\n\r\nLine two  ',
            }),
        )
        assert.equal(value.name, 'Jane Doe')
        assert.deepEqual(value.items, [{ productID: 7, quantity: 5 }, { productID: 8, quantity: 1 }])
        assert.equal(value.note, 'Line one\n\nLine two')
    })

    test('needs a name, a working email address and a phone number', () => {
        assert.match(validateOrder(validOrder({ name: '   ' })).error, /name/)
        for (const email of ['', 'jane', 'jane@', 'a b@c.com', 'jane@example', '<x>@y.com']) {
            assert.match(validateOrder(validOrder({ email })).error, /email/, email)
        }
        for (const tel of ['', '12', 'call me', '082 555 01<script>']) {
            assert.match(validateOrder(validOrder({ tel })).error, /phone/, tel)
        }
        assert.ok(validateOrder(validOrder({ tel: '+27 (82) 555-0134' })).value)
    })

    test('each delivery method asks for its own details', () => {
        assert.match(validateOrder(validOrder({ delivery: 'drone' })).error, /receive/)
        assert.match(validateOrder(validOrder({ delivery: 'to-door', address: '1 Main Rd' })).error, /address/)
        assert.match(validateOrder(validOrder({ delivery: 'postnet' })).error, /Postnet/)
        assert.match(validateOrder(validOrder({ delivery: 'pudo' })).error, /PUDO/)
        const door = validateOrder(
            validOrder({ delivery: 'to-door', address: '1 Main Rd', postalCode: '7550', province: 'WC', country: 'SA' }),
        )
        assert.equal(door.value.delivery.postalCode, '7550')
        assert.equal(validateOrder(validOrder({ delivery: 'pep', branch: 'Durbanville' })).value.delivery.branch, 'Durbanville')
    })

    test('rejects an empty cart and cart lines that make no sense', () => {
        assert.match(validateOrder(validOrder({ items: [] })).error, /empty/)
        assert.match(validateOrder(validOrder({ items: undefined })).error, /empty/)
        for (const item of [{ productID: 1, quantity: 0 }, { productID: 1, quantity: 1.5 }, { productID: 'x', quantity: 1 }, { productID: -3, quantity: 1 }, null]) {
            assert.match(validateOrder(validOrder({ items: [item] })).error, /cart/, JSON.stringify(item))
        }
        const many = Array.from({ length: 51 }, (_, i) => ({ productID: i + 1, quantity: 1 }))
        assert.match(validateOrder(validOrder({ items: many })).error, /too many/)
    })

    test('caps how many of one product can be ordered', () => {
        assert.equal(validateOrder(validOrder({ items: [{ productID: 1, quantity: 5000 }] })).value.items[0].quantity, 99)
    })

    test('the contact form needs a name, an email address and a message', () => {
        assert.match(validateContact({ name: '', email: 'a@b.co', message: 'Hi' }).error, /name/)
        assert.match(validateContact({ name: 'A', email: 'nope', message: 'Hi' }).error, /email/)
        assert.match(validateContact({ name: 'A', email: 'a@b.co', message: '  ' }).error, /message/)
        assert.equal(validateContact({ name: 'A', email: 'a@b.co', message: 'Hi\n\n\n\nthere' }).value.message, 'Hi\n\nthere')
    })

    test('order references look like PQ-260926-7K3F and are not repeated', () => {
        const refs = new Set(Array.from({ length: 200 }, () => newOrderReference(new Date('2026-09-26T10:00:00Z'))))
        assert.ok(refs.size > 190)
        for (const ref of refs) assert.match(ref, /^PQ-260926-[A-HJKMNP-Z2-9]{4}$/)
    })
})

const products = [
    { productID: 1, productName: 'Twin Mill', productCode: 'HW1', productPrice: 79.95, productSpecial: 0, productSpecialPrice: 0, productStock: 6 },
    { productID: 2, productName: 'Porsche <b>911</b>', productCode: '', productPrice: 145, productSpecial: 1, productSpecialPrice: 119, productStock: 1 },
    { productID: 3, productName: 'Labels', productCode: 'L3', productPrice: 34.5, productSpecial: 1, productSpecialPrice: 0, productStock: 0 },
]
const order = (fields = {}) => ({
    name: 'Jane van der Merwe',
    email: 'jane@example.com',
    tel: '0825550134',
    delivery: { method: 'collect' },
    note: '',
    items: [{ productID: 1, quantity: 3 }, { productID: 2, quantity: 2 }, { productID: 3, quantity: 1 }],
    ...fields,
})
const emailData = (fields, imagesUrl = 'http://localhost:5000/images') =>
    buildOrderEmailData(order(fields), products, { ref: 'PQ-TEST', now: new Date('2026-09-26T10:00:00Z'), imagesUrl })

describe('order emails', () => {
    test('prices and totals come from the products, with the special price while on special', () => {
        const data = emailData()
        // 3 x 79,95 + 2 x 119 (special) + 1 x 34,50 (special price 0 means no special)
        assert.equal(data.itemCount, 6)
        assert.equal(data.totalFormatted.replace(/\s/g, ' '), 'R 512,35')
        assert.deepEqual(data.items.map(item => item.onSpecial), [false, true, false])
        assert.equal(data.items[1].wasFormatted.replace(/\s/g, ' '), 'R 145,00')
        assert.equal(data.firstName, 'Jane')
    })

    test('the shop is warned about stock, the customer is not', () => {
        const data = emailData()
        assert.deepEqual(data.items.map(item => item.stockWarning), ['', 'Only 1 in stock', 'Out of stock'])

        const shop = renderEmail('order-shop', shopOrderData(data))
        assert.match(shop.html, /Only 1 in stock/)
        assert.match(shop.text, /! Out of stock/)

        const customer = renderEmail('order-customer', customerOrderData(data))
        assert.doesNotMatch(customer.html + customer.text, /in stock|Out of stock|Check the stock/)
    })

    test('delivery details show for each method, and free collection has no shipping note', () => {
        const door = emailData({ delivery: { method: 'to-door', address: '14 Protea Ave', postalCode: '7530', province: 'Western Cape', country: 'South Africa' } })
        assert.equal(door.delivery.title, 'Delivery to your door')
        assert.deepEqual(door.delivery.details, ['14 Protea Ave', '7530, Western Cape', 'South Africa'])
        assert.match(door.shippingNote, /not included/)

        const postnet = emailData({ delivery: { method: 'postnet', branch: 'Tyger Valley' } })
        assert.equal(postnet.delivery.title, 'Collect at Postnet')
        assert.deepEqual(postnet.delivery.details, ['Tyger Valley'])

        const collect = emailData()
        assert.match(collect.delivery.details[0], /19 Rand Street/)
        assert.equal(collect.shippingNote, '')
    })

    test('text typed by a customer can not add markup to the email', () => {
        const evil = '<script>alert(1)</script> & "quotes"'
        const data = emailData({ name: evil, note: `${evil}\nsecond line` })
        const html = renderEmail('order-shop', shopOrderData(data)).html + renderEmail('order-customer', customerOrderData(data)).html

        assert.doesNotMatch(html, /<script>/)
        assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;quotes&quot;/)
        // a product name with markup is escaped too, and line breaks in the note are kept
        assert.doesNotMatch(html, /Porsche <b>/)
        assert.match(html, /second line/)
        assert.match(html, /&quot;quotes&quot;<br>second line/)
    })

    test('the plain text keeps characters as typed and both versions carry the reference and total', () => {
        const data = emailData({ name: 'Tom & Jerry <t@j.co>', note: 'a "b" & c' })
        for (const [template, prepare] of [['order-shop', shopOrderData], ['order-customer', customerOrderData]]) {
            const { html, text } = renderEmail(template, prepare(data))
            assert.match(text, /a "b" & c/)
            assert.doesNotMatch(text, /&amp;|&quot;|<br/)
            for (const output of [html, text]) {
                assert.match(output, /PQ-TEST/)
                assert.match(output, /512,35/)
            }
        }
    })

    test('the logo is referenced from the email and the address of the shop is in the footer', () => {
        const { html } = renderEmail('order-customer', customerOrderData(emailData()))
        assert.match(html, /<img src="cid:pentique-logo"/)
        assert.match(html, /19 Rand Street, Durbanville, 7550/)
        assert.doesNotMatch(html, /\{\{|undefined/)
    })

    test('the contact email shows the message, escaped, with the sender', () => {
        const data = contactEmailData({ name: 'Thabo', email: 'thabo@example.com', message: 'Hi <i>there</i>\n\nDo you have a Camaro?' }, new Date('2026-09-26T10:00:00Z'))
        const { html, text } = renderEmail('contact', data)
        assert.match(html, /mailto:thabo@example\.com/)
        assert.match(html, /Hi &lt;i&gt;there&lt;\/i&gt;<br><br>Do you have a Camaro\?/)
        assert.match(text, /Hi <i>there<\/i>/)
        assert.equal(data.subject, 'Contact form: message from Thabo')
    })
})

describe('order and contact forms (dev database)', () => {
    let previewDir
    let categoryID
    let visibleProductID
    let hiddenProductID
    const saved = {}

    // a stand in for the express response
    const respond = () => {
        const res = { statusCode: 200, body: undefined }
        res.status = code => ((res.statusCode = code), res)
        res.json = body => ((res.body = body), res)
        return res
    }
    const request = body => ({ body, protocol: 'http', get: () => 'localhost:5000' })
    const emailsWritten = () => fs.readdirSync(previewDir).filter(file => file.endsWith('.html'))

    before(async () => {
        previewDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pentique-emails-'))
        for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SHOP_EMAIL', 'EMAIL_PREVIEW_DIR', 'NODE_ENV']) saved[key] = process.env[key]
        delete process.env.SMTP_HOST
        delete process.env.SMTP_USER
        delete process.env.SMTP_PASS
        process.env.SHOP_EMAIL = 'shop@example.com'
        process.env.EMAIL_PREVIEW_DIR = previewDir
        process.env.NODE_ENV = 'development'

        const [visible] = await db.query('SELECT productID FROM product WHERE productHidden = 0 AND productStock > 0 LIMIT 1')
        visibleProductID = visible[0].productID
        await db.query('DELETE FROM product WHERE productName = "__test orders hidden"')
        await db.query('DELETE FROM category WHERE categoryName = "__test orders" AND parentCategoryID IS NULL')
        categoryID = await createCategory('__test orders', null)
        hiddenProductID = (
            await addProduct({
                productName: '__test orders hidden', productDescription: '', productPrice: 1, productCode: null, productHidden: 1,
                productSpecial: 0, productSpecialPrice: 0, productStock: 1, productImage0: '', productImage1: '', productImage2: '',
                productImage3: '', categoryID, productFeatured: 0,
            })
        ).insertId
    })

    after(async () => {
        for (const [key, value] of Object.entries(saved)) value === undefined ? delete process.env[key] : (process.env[key] = value)
        fs.rmSync(previewDir, { recursive: true, force: true })
        await db.query('DELETE FROM product WHERE productID = ?', [hiddenProductID])
        await db.query('DELETE FROM category WHERE categoryID = ?', [categoryID])
        await db.end()
    })

    const orderBody = (fields = {}) => ({
        name: 'Jane Doe', email: 'jane@example.com', tel: '0825550134', delivery: 'collect',
        items: [{ productID: visibleProductID, quantity: 2 }], ...fields,
    })

    test('a valid order makes an email for the shop and a confirmation for the customer', async () => {
        const res = respond()
        await placeOrderController(request(orderBody({ note: 'Please wrap it' })), res)

        assert.equal(res.statusCode, 200)
        assert.match(res.body.ref, /^PQ-\d{6}-[A-Z0-9]{4}$/)
        assert.equal(res.body.confirmationSent, true)

        const files = emailsWritten()
        assert.equal(files.length, 2)
        const [first, second] = files.map(file => fs.readFileSync(path.join(previewDir, file), 'utf8'))
        const shop = first.includes('To: shop@example.com') ? first : second
        const customer = first.includes('To: jane@example.com') ? first : second
        assert.match(shop, new RegExp(`Subject: New order ${res.body.ref} from Jane Doe`))
        assert.match(shop, /Please wrap it/)
        assert.match(customer, new RegExp(`Subject: Your Pentique order ${res.body.ref}`))
    })

    test('an order for products that are hidden or gone is refused and nothing is sent', async () => {
        const before = emailsWritten().length
        const res = respond()
        await placeOrderController(request(orderBody({ items: [{ productID: visibleProductID, quantity: 1 }, { productID: hiddenProductID, quantity: 1 }, { productID: 999999999, quantity: 1 }] })), res)

        assert.equal(res.statusCode, 409)
        assert.deepEqual(res.body.unavailable.sort(), [hiddenProductID, 999999999].sort())
        assert.equal(emailsWritten().length, before)
    })

    test('a bad order is refused with a message, and a filled in hidden field is quietly ignored', async () => {
        const before = emailsWritten().length
        const bad = respond()
        await placeOrderController(request(orderBody({ email: 'nope' })), bad)
        assert.equal(bad.statusCode, 400)
        assert.match(bad.body.message, /email/)

        const bot = respond()
        await placeOrderController(request(orderBody({ website: 'http://spam.example' })), bot)
        assert.equal(bot.statusCode, 200)
        assert.equal(emailsWritten().length, before)
    })

    test('when the shop email can not be sent the order fails, so it is never lost silently', async () => {
        process.env.NODE_ENV = 'production' // production has no preview fallback
        const res = respond()
        const log = console.error
        console.error = () => {}
        try {
            await placeOrderController(request(orderBody()), res)
        } finally {
            console.error = log
            process.env.NODE_ENV = 'development'
        }
        assert.equal(res.statusCode, 500)
        assert.match(res.body.message, /could not be placed/)
    })

    test('the contact form emails the shop with the sender as the person to reply to', async () => {
        const before = emailsWritten().length
        const res = respond()
        await sendContactController(request({ name: 'Thabo', email: 'thabo@example.com', message: 'Do you have a Camaro?' }), res)

        assert.equal(res.statusCode, 200)
        assert.deepEqual(res.body, { sent: true })
        const files = emailsWritten()
        assert.equal(files.length, before + 1)
        const sent = fs.readFileSync(path.join(previewDir, files.at(-1)), 'utf8')
        assert.match(sent, /To: shop@example\.com/)
        assert.match(sent, /Do you have a Camaro\?/)

        const bad = respond()
        await sendContactController(request({ name: 'Thabo', email: 'thabo@example.com', message: '' }), bad)
        assert.equal(bad.statusCode, 400)
    })
})

describe('form rate limit', () => {
    test('lets a visitor send a few, then asks them to wait', () => {
        const limit = rateLimit({ max: 2, windowMs: 60_000, message: 'Wait' })
        const run = ip => {
            const res = { headers: {}, setHeader(k, v) { this.headers[k] = v }, status(code) { this.code = code; return this }, json(body) { this.body = body } }
            let passed = false
            limit({ ip }, res, () => (passed = true))
            return { passed, res }
        }
        assert.ok(run('1.1.1.1').passed)
        assert.ok(run('1.1.1.1').passed)
        const blocked = run('1.1.1.1')
        assert.equal(blocked.passed, false)
        assert.equal(blocked.res.code, 429)
        assert.deepEqual(blocked.res.body, { message: 'Wait' })
        assert.ok(Number(blocked.res.headers['Retry-After']) > 0)
        // another visitor is not affected
        assert.ok(run('2.2.2.2').passed)
    })
})
