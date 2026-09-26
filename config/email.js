// Sends the shop's emails (orders, contact form) with nodemailer.
//
// Settings, in the .env.<NODE_ENV> file:
//   SMTP_HOST, SMTP_PORT (587), SMTP_SECURE ("true" for port 465), SMTP_USER, SMTP_PASS   the mail server to send through
//   EMAIL_FROM   who the emails come from, e.g. "Pentique" <orders@pentique.co.za>
//   SHOP_EMAIL   where order and contact form notifications go
//
// Without SMTP settings nothing is sent. Outside production the email is written to server/email-previews/ as an
// HTML file instead, so the templates can be looked at (and checkout tested) before a sender is set up. In
// production a missing setup is an error, so an order is never silently lost.
import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'
import { LOGO_CID, LOGO_FILE, logoDataUri } from '../emails/render.js'

export class EmailNotConfiguredError extends Error {
    constructor() {
        super('Email is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASS')
        this.name = 'EmailNotConfiguredError'
    }
}

export const emailConfigured = () =>
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

export const shopEmail = () => (process.env.SHOP_EMAIL || '').trim()

let transporter = null
const getTransporter = () => {
    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for port 465, other ports upgrade with STARTTLS
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        })
    }
    return transporter
}

export const verifyEmailConfig = async () => {
    if (!emailConfigured()) {
        console.log('Email: no SMTP settings, emails are written to email-previews/ (not sent)')
        return false
    }
    try {
        await getTransporter().verify()
        console.log('Email: mail server connection verified')
        return true
    } catch (error) {
        console.error('Email: mail server connection failed:', error.message)
        return false
    }
}

const previewDir = () => path.resolve(process.env.EMAIL_PREVIEW_DIR || 'email-previews')

// Save the email as a standalone HTML file (the logo inlined) instead of sending it
const writePreview = ({ to, subject, html, text, attachments = [] }) => {
    const dir = previewDir()
    fs.mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 50).replace(/^-|-$/g, '')
    const file = path.join(dir, `${stamp}-${slug}.html`)
    // (a customer's text must not be able to end the comment early)
    const details = `To: ${to}\n     Subject: ${subject}\n\n${text}`.replaceAll('--', '- -')
    const note = `<!-- ${details}\n-->\n`
    // the pictures that would travel inside the email are put into the file instead
    let page = html.replaceAll(`cid:${LOGO_CID}`, logoDataUri())
    for (const { cid, path: picture } of attachments) {
        page = page.replaceAll(`cid:${cid}`, `data:image/jpeg;base64,${fs.readFileSync(picture).toString('base64')}`)
    }
    fs.writeFileSync(file, note + page)
    console.log(`Email not sent (no SMTP settings), preview written to ${file}`)
    return file
}

/**
 * @param {{ to: string, subject: string, html: string, text: string, replyTo?: string, attachments?: object[] }} email (attachments: pictures the html shows through cid:)
 * @returns {Promise<{ sent: boolean, messageId?: string, previewFile?: string }>}
 */
export const sendEmail = async ({ to, subject, html, text, replyTo, attachments = [] }) => {
    if (!emailConfigured()) {
        if (process.env.NODE_ENV === 'production') throw new EmailNotConfiguredError()
        return { sent: false, previewFile: writePreview({ to, subject, html, text, attachments }) }
    }

    const info = await getTransporter().sendMail({
        from: process.env.EMAIL_FROM || '"Pentique" <noreply@pentique.co.za>',
        to,
        replyTo,
        subject,
        html,
        text,
        // the logo and the product pictures travel inside the email, so they show without "load images"
        attachments: [{ filename: 'logo.png', path: LOGO_FILE, cid: LOGO_CID }, ...attachments],
    })
    return { sent: true, messageId: info.messageId }
}
