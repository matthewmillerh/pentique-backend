// Checking what a customer sends from the checkout and contact forms, and turning an order into what the emails show.
// The prices, names and stock in the emails always come from the database, never from the browser.
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { sellingPrice } from './pricing.js'

const PRODUCTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../images/products')

export const SHOP_ADDRESS = '19 Rand Street, Durbanville, 7550'
export const MAX_QUANTITY = 99
export const MAX_ORDER_LINES = 50

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' })
export const formatMoney = value => money.format(value)
const cents = value => Math.round(value * 100)

// ---- what the customer typed

// One line of text: no line breaks or control characters, spaces tidied, cut to `max` characters
const oneLine = (value, max) =>
    typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : ''

// Text with line breaks kept (a note, a message)
const manyLines = (value, max) =>
    typeof value === 'string'
        ? value
              .replace(/\r\n?/g, '\n')
              .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
              .replace(/[ \t]+\n/g, '\n')
              .replace(/\n{3,}/g, '\n\n')
              .trim()
              .slice(0, max)
        : ''

const isEmail = value => value.length <= 254 && /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/.test(value)

export const DELIVERY_METHODS = ['collect', 'to-door', 'postnet', 'pep', 'pudo']
const BRANCH_LABELS = { postnet: 'Postnet', pep: 'Pep', pudo: 'PUDO locker' }

// A field a bot filled in on purpose: the form has a hidden "website" box that people never see
export const isSpam = body => typeof body?.website === 'string' && body.website.trim() !== ''

/**
 * @returns {{ value: object } | { error: string }}
 */
export const validateOrder = body => {
    if (!body || typeof body !== 'object') return { error: 'The order could not be read.' }

    const name = oneLine(body.name, 100)
    const email = oneLine(body.email, 254)
    const tel = oneLine(body.tel, 30)
    if (!name) return { error: 'Please enter your name.' }
    if (!isEmail(email)) return { error: 'Please enter a valid email address.' }
    if (!/\d{5,}/.test(tel.replace(/[\s()+-]/g, '')) || !/^[\d\s()+-]+$/.test(tel)) {
        return { error: 'Please enter a valid phone number.' }
    }

    const method = oneLine(body.delivery, 20)
    if (!DELIVERY_METHODS.includes(method)) return { error: 'Please choose how you would like to receive your order.' }
    const delivery = { method }
    if (method === 'to-door') {
        delivery.address = oneLine(body.address, 200)
        delivery.postalCode = oneLine(body.postalCode, 10)
        delivery.province = oneLine(body.province, 100)
        delivery.country = oneLine(body.country, 100)
        if (!delivery.address || !delivery.postalCode || !delivery.province || !delivery.country) {
            return { error: 'Please fill in the full delivery address.' }
        }
    } else if (method !== 'collect') {
        delivery.branch = oneLine(body.branch, 100)
        if (!delivery.branch) return { error: `Please enter the ${BRANCH_LABELS[method]} branch to collect from.` }
    }

    if (!Array.isArray(body.items) || !body.items.length) return { error: 'Your cart is empty.' }
    if (body.items.length > MAX_ORDER_LINES) return { error: 'There are too many different products in this order.' }
    // the same product twice becomes one line
    const quantities = new Map()
    for (const item of body.items) {
        const productID = Number(item?.productID)
        const quantity = Number(item?.quantity)
        if (!Number.isInteger(productID) || productID <= 0 || !Number.isInteger(quantity) || quantity < 1) {
            return { error: 'Something in your cart could not be read. Please review your cart.' }
        }
        quantities.set(productID, Math.min(MAX_QUANTITY, (quantities.get(productID) || 0) + quantity))
    }

    return {
        value: {
            name,
            email,
            tel,
            delivery,
            note: manyLines(body.note, 1000),
            items: [...quantities].map(([productID, quantity]) => ({ productID, quantity })),
        },
    }
}

export const validateContact = body => {
    if (!body || typeof body !== 'object') return { error: 'The message could not be read.' }
    const name = oneLine(body.name, 100)
    const email = oneLine(body.email, 254)
    const message = manyLines(body.message, 5000)
    if (!name) return { error: 'Please enter your name.' }
    if (!isEmail(email)) return { error: 'Please enter a valid email address.' }
    if (!message) return { error: 'Please enter a message.' }
    return { value: { name, email, message } }
}

// ---- turning an order into the emails

// PQ-260926-7K3F: the day and four characters that can not be mixed up (no 0/O or 1/I)
export const newOrderReference = (now = new Date()) => {
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
    const day = now.toISOString().slice(2, 10).replace(/-/g, '')
    const suffix = Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('')
    return `PQ-${day}-${suffix}`
}

const formatDateTime = date =>
    date.toLocaleString('en-ZA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Africa/Johannesburg' })

// The small picture beside a product: its thumbnail, else its first image (read only, nothing is changed).
// Returns the file, or '' when the product has no picture.
const thumbFile = productID => {
    for (const relative of [`thumbs/${productID}_0.jpg`, `${productID}_0.jpg`]) {
        const file = path.join(PRODUCTS_DIR, String(productID), relative)
        if (fs.existsSync(file)) return file
    }
    return ''
}

// The pictures travel inside the email (like the logo) instead of being loaded from the website: mail apps such as
// Gmail hide pictures that have to be fetched until the reader allows them, especially from a new sender.
const thumbCid = productID => `product-${productID}`

const deliveryDetails = delivery => {
    const priceNote = 'The price is worked out after the order is placed.'
    switch (delivery.method) {
        case 'to-door':
            return {
                title: 'Delivery to your door',
                details: [delivery.address, `${delivery.postalCode}, ${delivery.province}`, delivery.country],
                note: priceNote,
            }
        case 'postnet':
        case 'pep':
        case 'pudo':
            return {
                title: `Collect at ${BRANCH_LABELS[delivery.method]}`,
                details: [delivery.branch],
                note: priceNote,
            }
        default:
            return { title: 'Collect from the shop', details: [SHOP_ADDRESS], note: 'Free' }
    }
}

/**
 * The details of an order as the two order emails show them.
 * @param {object} order a checked order (see validateOrder)
 * @param {object[]} products the products of the order as they are in the database
 * @returns {object}
 */
export const buildOrderEmailData = (order, products, { ref, now = new Date() }) => {
    const byID = new Map(products.map(product => [product.productID, product]))
    let totalCents = 0
    let itemCount = 0

    const items = order.items.map(({ productID, quantity }) => {
        const product = byID.get(productID)
        const price = sellingPrice(product)
        const lineCents = cents(price) * quantity
        totalCents += lineCents
        itemCount += quantity

        const stock = Number(product.productStock) || 0
        const onSpecial = price !== Number(product.productPrice)
        const file = thumbFile(productID)
        return {
            name: product.productName,
            code: (product.productCode || '').trim(),
            qty: quantity,
            priceFormatted: formatMoney(price),
            onSpecial,
            wasFormatted: onSpecial ? formatMoney(Number(product.productPrice)) : '',
            lineTotalFormatted: formatMoney(lineCents / 100),
            thumbUrl: file ? `cid:${thumbCid(productID)}` : '',
            thumbFile: file,
            stockWarning: stock <= 0 ? 'Out of stock' : quantity > stock ? `Only ${stock} in stock` : '',
        }
    })

    const delivery = deliveryDetails(order.delivery)
    const totalFormatted = formatMoney(totalCents / 100)
    return {
        ref,
        placedAt: formatDateTime(now),
        name: order.name,
        firstName: order.name.split(' ')[0],
        email: order.email,
        tel: order.tel,
        delivery,
        note: order.note,
        items,
        itemCount,
        singleItem: itemCount === 1,
        totalFormatted,
        hasStockWarnings: items.some(item => item.stockWarning),
        shippingNote: order.delivery.method === 'collect' ? '' : 'Shipping is not included in this total.',
    }
}

// The pictures of an order's products, to attach to the email so its cid:product-... images show
export const thumbAttachments = data =>
    [...new Map(data.items.filter(item => item.thumbFile).map(item => [item.thumbUrl, item])).values()].map(item => ({
        filename: path.basename(item.thumbFile),
        path: item.thumbFile,
        cid: item.thumbUrl.slice('cid:'.length),
    }))

// What the email to the shop shows: the order with its subject line, and the stock warnings only the shop needs
export const shopOrderData = data => ({
    ...data,
    subject: `New order ${data.ref} from ${data.name} (${data.totalFormatted})`,
    preheader: `${data.name} ordered ${data.itemCount} ${data.singleItem ? 'item' : 'items'} for ${data.totalFormatted}. ${data.delivery.title}.`,
})

// What the confirmation to the customer shows (no stock warnings)
export const customerOrderData = data => ({
    ...data,
    items: data.items.map(item => ({ ...item, stockWarning: '' })),
    hasStockWarnings: false,
    subject: `Your Pentique order ${data.ref}`,
    preheader: `We have received order ${data.ref}. Your invoice and payment instructions will follow.`,
})

export const contactEmailData = (contact, now = new Date()) => ({
    ...contact,
    sentAt: formatDateTime(now),
    subject: `Contact form: message from ${contact.name}`,
    preheader: contact.message.replace(/\s+/g, ' ').slice(0, 110),
})
