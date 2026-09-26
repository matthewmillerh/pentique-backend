// Writes every email, filled in with made up orders, to server/email-previews/ so they can be opened in a browser
// while they are being designed. Nothing is sent. Run: npm run email:preview
import fs from 'fs'
import path from 'path'
import { LOGO_CID, logoDataUri, renderEmail } from './render.js'
import {
    buildOrderEmailData,
    contactEmailData,
    customerOrderData,
    newOrderReference,
    shopOrderData,
} from '../utils/orders.js'

const dir = path.resolve(process.env.EMAIL_PREVIEW_DIR || 'email-previews')
fs.mkdirSync(dir, { recursive: true })

const imagesUrl = `http://localhost:${process.env.PORT || 5000}/images`
const products = [
    { productID: 84, productName: 'Hot Wheels Tooned Twin Mill', productCode: 'HW1042', productPrice: 79.95, productSpecial: 0, productSpecialPrice: 0, productStock: 6 },
    { productID: 86, productName: 'Majorette Porsche 911 GT3 RS in a Presentation Box', productCode: 'MJ2231', productPrice: 145, productSpecial: 1, productSpecialPrice: 119, productStock: 1 },
    { productID: 122, productName: 'Round labels', productCode: '', productPrice: 34.5, productSpecial: 0, productSpecialPrice: 0, productStock: 0 },
]
const order = {
    name: 'Jane van der Merwe',
    email: 'jane@example.com',
    tel: '082 555 0134',
    delivery: { method: 'to-door', address: '14 Protea Avenue, Bellville', postalCode: '7530', province: 'Western Cape', country: 'South Africa' },
    note: 'Please gift wrap the Porsche if you can.\nThank you!',
    items: [
        { productID: 84, quantity: 2 },
        { productID: 86, quantity: 1 },
        { productID: 122, quantity: 3 },
    ],
}

const write = (name, subject, { html, text }) => {
    const file = path.join(dir, `${name}.html`)
    fs.writeFileSync(file, `<!-- ${subject} -->\n` + html.replaceAll(`cid:${LOGO_CID}`, logoDataUri()))
    fs.writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${subject}\n\n${text}`)
    console.log(file)
}

const data = buildOrderEmailData(order, products, { ref: newOrderReference(), imagesUrl })
const shop = shopOrderData(data)
const customer = customerOrderData(data)
write('order-shop', shop.subject, renderEmail('order-shop', shop))
write('order-customer', customer.subject, renderEmail('order-customer', customer))

const collect = buildOrderEmailData(
    { ...order, delivery: { method: 'collect' }, note: '', items: [order.items[0]] },
    products,
    { ref: newOrderReference(), imagesUrl },
)
const collectData = customerOrderData(collect)
write('order-customer-collect', collectData.subject, renderEmail('order-customer', collectData))

const contact = contactEmailData({
    name: 'Thabo Nkosi',
    email: 'thabo@example.com',
    message: 'Hi there,\n\nDo you still have the Hot Wheels Silver Series Camaro in stock? I could not find it on the site.\n\nThanks',
})
write('contact', contact.subject, renderEmail('contact', contact))
