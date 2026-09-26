// Renders the email templates in ./templates: <name>.hbs (the HTML email) and <name>.txt.hbs (the plain text
// version that goes with it). Every HTML email is wrapped in layout.hbs, which holds the header, footer and the
// shared styling. Values are HTML escaped ({{value}}), so text typed by a customer can not add markup.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Handlebars from 'handlebars'

const EMAILS_DIR = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = path.join(EMAILS_DIR, 'templates')

// The logo is attached to each email and shown through this content id
export const LOGO_CID = 'pentique-logo'
export const LOGO_FILE = path.join(EMAILS_DIR, 'assets', 'logo.png')

let logoUri = null
export const logoDataUri = () => {
    logoUri ??= `data:image/png;base64,${fs.readFileSync(LOGO_FILE).toString('base64')}`
    return logoUri
}

// A separate Handlebars instance, so nothing else in the app can change how emails render
const hbs = Handlebars.create()
hbs.registerHelper('multiline', text => new hbs.SafeString(hbs.escapeExpression(text).replace(/\r?\n/g, '<br>')))

const compiled = new Map()
const load = file => {
    // in development a template edit shows up on the next email, in production they are read once
    if (compiled.has(file) && process.env.NODE_ENV === 'production') return compiled.get(file)
    const template = hbs.compile(fs.readFileSync(path.join(TEMPLATES_DIR, file), 'utf8'), { noEscape: file.endsWith('.txt.hbs') })
    compiled.set(file, template)
    return template
}

// layout.hbs wraps every email, items.hbs is the product list the two order emails share
const PARTIALS = ['layout', 'items']
let partialsRegistered = false
const registerPartials = () => {
    if (partialsRegistered && process.env.NODE_ENV === 'production') return
    PARTIALS.forEach(name => hbs.registerPartial(name, fs.readFileSync(path.join(TEMPLATES_DIR, `${name}.hbs`), 'utf8')))
    partialsRegistered = true
}

export const TEMPLATES = ['order-shop', 'order-customer', 'contact']

/**
 * @param {'order-shop'|'order-customer'|'contact'} name
 * @param {object} data what the template shows
 * @returns {{ html: string, text: string }}
 */
export const renderEmail = (name, data) => {
    if (!TEMPLATES.includes(name)) throw new Error(`Unknown email template: ${name}`)
    registerPartials()
    const context = { ...data, logoSrc: `cid:${LOGO_CID}`, year: new Date().getFullYear() }
    return {
        html: load(`${name}.hbs`)(context),
        // the plain text is not HTML: keep quotes and ampersands as typed
        text: load(`${name}.txt.hbs`)(context).replace(/\n{3,}/g, '\n\n').trim() + '\n',
    }
}
