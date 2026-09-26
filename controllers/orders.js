import { getProductsForOrder } from '../models/productModel.js'
import { sendEmail, shopEmail } from '../config/email.js'
import { renderEmail } from '../emails/render.js'
import {
    buildOrderEmailData,
    contactEmailData,
    customerOrderData,
    isSpam,
    newOrderReference,
    shopOrderData,
    validateContact,
    validateOrder,
} from '../utils/orders.js'

const NOT_SENT_MESSAGE = 'Your message could not be sent right now. Please try again in a little while.'

const imagesUrlFor = req => `${process.env.HTTP_PROTOCOL || req.protocol}://${req.get('host')}/images`

// Place an order: the shop gets the order, and the customer gets a confirmation
export const placeOrderController = async (req, res) => {
    try {
        // bots that fill in the hidden field are told it worked, so they do not try again
        if (isSpam(req.body)) return res.json({ ref: newOrderReference(), confirmationSent: true })

        const checked = validateOrder(req.body)
        if (checked.error) return res.status(400).json({ message: checked.error })
        const order = checked.value

        const products = await getProductsForOrder(order.items.map(item => item.productID))
        const found = new Map(products.map(product => [product.productID, product]))
        const unavailable = order.items.filter(item => !found.has(item.productID) || found.get(item.productID).productHidden)
        if (unavailable.length) {
            return res.status(409).json({
                message: 'Some of the products in your cart are no longer available. Please review your cart and try again.',
                unavailable: unavailable.map(item => item.productID),
            })
        }

        const now = new Date()
        const ref = newOrderReference(now)
        const data = buildOrderEmailData(order, products, { ref, now, imagesUrl: imagesUrlFor(req) })

        // the order itself: without this email the shop would never see it, so a failure is reported to the customer
        const toShop = shopEmail()
        if (!toShop) throw new Error('SHOP_EMAIL is not set')
        const shopData = shopOrderData(data)
        await sendEmail({
            to: toShop,
            replyTo: order.email,
            subject: shopData.subject,
            ...renderEmail('order-shop', shopData),
        })

        // the confirmation is a courtesy: the shop has the order, so a failure only gets logged
        let confirmationSent = true
        try {
            const customerData = customerOrderData(data)
            await sendEmail({
                to: order.email,
                replyTo: toShop,
                subject: customerData.subject,
                ...renderEmail('order-customer', customerData),
            })
        } catch (error) {
            confirmationSent = false
            console.error(`Order ${ref}: the confirmation email to the customer failed:`, error.message)
        }

        console.log(`Order ${ref} placed: ${data.itemCount} items, ${data.totalFormatted}`)
        res.json({ ref, confirmationSent })
    } catch (error) {
        console.error('Error in placeOrderController:', error)
        res.status(500).json({
            message: 'Your order could not be placed right now. Please try again in a little while, or contact us.',
        })
    }
}

// The contact form: the shop gets the message, with the sender as reply-to
export const sendContactController = async (req, res) => {
    try {
        if (isSpam(req.body)) return res.json({ sent: true })

        const checked = validateContact(req.body)
        if (checked.error) return res.status(400).json({ message: checked.error })

        const toShop = shopEmail()
        if (!toShop) throw new Error('SHOP_EMAIL is not set')
        const data = contactEmailData(checked.value)
        await sendEmail({
            to: toShop,
            replyTo: checked.value.email,
            subject: data.subject,
            ...renderEmail('contact', data),
        })

        res.json({ sent: true })
    } catch (error) {
        console.error('Error in sendContactController:', error)
        res.status(500).json({ message: NOT_SENT_MESSAGE })
    }
}
