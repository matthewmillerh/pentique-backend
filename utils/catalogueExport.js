// Builds the product catalogue workbook (Excel) for the admin "Export Product Catalogue" button:
//   Summary     headline figures and a breakdown per top level category
//   Products    every product, hidden ones included, with its category path and all of its details
//   Categories  the category tree, indented and grouped so branches can be collapsed
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import ExcelJS from 'exceljs'
import { buildTree, categoryPath } from '../models/categoryModel.js'

const PRODUCTS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../images/products')

// Pentique colours (the pink, blue and yellow of the site), as Excel ARGB
const COLOURS = {
    ink: 'FF1F2937',
    muted: 'FF6B7280',
    header: 'FF3E6A93', // a deeper shade of the site's blue, so white text reads well on it
    blue: 'FF78A3C9',
    blueTint: 'FFEAF1F8',
    pink: 'FFFAA1C9',
    pinkInk: 'FFB83280',
    yellow: 'FFFECB41',
    yellowTint: 'FFFFF7DC',
    band: 'FFF8FAFC',
    rule: 'FFE5E7EB',
    redInk: 'FFB91C1C',
    redTint: 'FFFDECEC',
    greyTint: 'FFF1F1F3',
    white: 'FFFFFFFF',
}

const RAND = '"R" #,##0.00'
const WHOLE = '#,##0'
const FONT = 'Calibri'

const fill = argb => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const thinRule = { style: 'thin', color: { argb: COLOURS.rule } }

// Descriptions are stored as HTML fragments (mostly <br/>): make them plain text with real line breaks
const plainText = html =>
    String(html || '')
        .replace(/<br\s*\/?\s*>?/gi, '\n') // also a <br/ with its > missing, which some descriptions have
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

// The product's images that exist on disk, without changing anything (unlike generateProductImageUrls, which also
// tidies up files). Images are stored as <id>_<slot>.jpg, older products may still use the name in the database.
const productImages = (product, imagesUrl) => {
    const found = []
    for (let slot = 0; slot < 4; slot++) {
        const dbName = product[`productImage${slot}`]
        if (!dbName) continue
        for (const name of [`${product.productID}_${slot}.jpg`, dbName]) {
            if (fs.existsSync(path.join(PRODUCTS_DIR, String(product.productID), name))) {
                found.push(`${imagesUrl}/products/${product.productID}/${encodeURIComponent(name)}`)
                break
            }
        }
    }
    return found
}

// What one unit sells for right now
const sellingPrice = product =>
    product.productSpecial && Number(product.productSpecialPrice) > 0
        ? Number(product.productSpecialPrice)
        : Number(product.productPrice)

const exportedAt = date =>
    new Intl.DateTimeFormat('en-ZA', {
        dateStyle: 'long',
        timeStyle: 'short',
        timeZone: 'Africa/Johannesburg',
    }).format(date)

// Title and subtitle across the top of a sheet
function addTitle(sheet, lastColumn, title, subtitle) {
    sheet.mergeCells(1, 1, 1, lastColumn)
    sheet.mergeCells(2, 1, 2, lastColumn)
    const titleCell = sheet.getCell(1, 1)
    titleCell.value = title
    titleCell.font = { name: FONT, size: 18, bold: true, color: { argb: COLOURS.ink } }
    titleCell.alignment = { vertical: 'middle' }
    sheet.getRow(1).height = 30
    const subtitleCell = sheet.getCell(2, 1)
    subtitleCell.value = subtitle
    subtitleCell.font = { name: FONT, size: 10, color: { argb: COLOURS.muted } }
    // a thin band of the three Pentique colours under the title
    for (let column = 1; column <= lastColumn; column++) {
        const colour = [COLOURS.yellow, COLOURS.pink, COLOURS.blue][
            Math.min(2, Math.floor(((column - 1) / lastColumn) * 3))
        ]
        sheet.getCell(3, column).fill = fill(colour)
    }
    sheet.getRow(3).height = 4
}

// Excel row groups (the +/- buttons in the margin). Excel allows 7 levels; the sheet has to declare one more level
// than it uses, or ExcelJS flags every grouped row as collapsed and Excel reports the file as damaged.
const MAX_OUTLINE = 6
const outlineLevel = level => Math.min(level, MAX_OUTLINE)

// The group headings (category rows) sit above their rows, so the +/- buttons are on the heading. Set after the
// sheet is made: ExcelJS ignores it when passed to addWorksheet.
function useGroupsWithHeadingsAbove(sheet) {
    sheet.properties.outlineProperties = { summaryBelow: false, summaryRight: false }
}

function declareOutlineLevels(sheet) {
    let deepest = 0
    sheet.eachRow(row => (deepest = Math.max(deepest, row.outlineLevel || 0)))
    sheet.properties.outlineLevelRow = deepest ? deepest + 1 : 0
}

// Column headings: tall enough for two lines, so a heading that wraps is not cut off
function styleHeaderRow(row) {
    row.height = 32
    row.eachCell(cell => {
        cell.font = { name: FONT, size: 11, bold: true, color: { argb: COLOURS.white } }
        cell.fill = fill(COLOURS.header)
        cell.alignment = { vertical: 'middle', wrapText: true }
        cell.border = { bottom: { style: 'medium', color: { argb: COLOURS.blue } } }
    })
}

const PRODUCT_COLUMNS = [
    { header: 'Code', key: 'code', width: 12 },
    { header: 'Product name', key: 'name', width: 44 },
    { header: 'Price', key: 'price', width: 12, numFmt: RAND },
    { header: 'On special', key: 'special', width: 11 },
    { header: 'Special price', key: 'specialPrice', width: 13, numFmt: RAND },
    { header: 'Stock', key: 'stock', width: 9, numFmt: WHOLE },
    { header: 'Stock status', key: 'status', width: 13 },
    { header: 'Stock value', key: 'value', width: 14, numFmt: RAND },
    { header: 'In store', key: 'visible', width: 10 },
    { header: 'Featured', key: 'featured', width: 10 },
    { header: 'Description', key: 'description', width: 60 },
    { header: 'Images', key: 'images', width: 9, numFmt: WHOLE },
    { header: 'Main image', key: 'image', width: 13 },
    { header: 'Product ID', key: 'id', width: 11 },
]

// A heading row for a category: where it sits (its parents, muted), its name and how many products are in it.
// Top level categories stand out more; deeper ones are indented.
function addCategoryHeading(sheet, trail, node, depth) {
    const row = sheet.addRow([])
    const last = PRODUCT_COLUMNS.length
    sheet.mergeCells(row.number, 1, row.number, last)
    const cell = row.getCell(1)
    const size = depth === 0 ? 13 : 11
    const count = node.productCount === 1 ? '1 product' : `${node.productCount} products`
    cell.value = {
        richText: [
            ...(trail.length
                ? [{ text: `${trail.join(' › ')} › `, font: { name: FONT, size, color: { argb: COLOURS.muted } } }]
                : []),
            { text: node.name, font: { name: FONT, size, bold: true, color: { argb: COLOURS.ink } } },
            { text: `   ·   ${count}`, font: { name: FONT, size: 10, color: { argb: COLOURS.muted } } },
        ],
    }
    cell.alignment = { vertical: 'middle', indent: depth * 2 }
    cell.fill = fill(depth === 0 ? COLOURS.blueTint : 'FFF5F8FB')
    cell.border =
        depth === 0
            ? { top: { style: 'medium', color: { argb: COLOURS.blue } }, bottom: thinRule }
            : { top: thinRule, bottom: thinRule }
    row.height = depth === 0 ? 26 : 21
    row.outlineLevel = outlineLevel(depth)
}

function addProductRow(sheet, row, depth, banded) {
    const excelRow = sheet.addRow(row)
    // the products sit one level inside their category, so collapsing the category hides them
    excelRow.outlineLevel = outlineLevel(depth + 1)
    excelRow.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const column = PRODUCT_COLUMNS[columnNumber - 1]
        cell.font = { name: FONT, size: 10, color: { argb: COLOURS.ink } }
        cell.alignment = { vertical: 'top', wrapText: ['name', 'description'].includes(column.key) }
        cell.border = { bottom: thinRule }
        if (banded) cell.fill = fill(COLOURS.band)
        if (column.numFmt) cell.numFmt = column.numFmt
    })
    for (const key of ['special', 'stock', 'status', 'visible', 'featured', 'images']) {
        excelRow.getCell(key).alignment = { vertical: 'top', horizontal: 'center' }
    }
    // the product names line up under their category heading
    excelRow.getCell('code').alignment = { vertical: 'top', indent: Math.min(depth, 7) }

    // Things worth spotting at a glance
    if (row.stock === 0) {
        for (const key of ['stock', 'status']) {
            excelRow.getCell(key).font = { name: FONT, size: 10, bold: true, color: { argb: COLOURS.redInk } }
            excelRow.getCell(key).fill = fill(COLOURS.redTint)
        }
    }
    if (row.visible === 'Hidden') {
        excelRow.getCell('visible').font = { name: FONT, size: 10, italic: true, color: { argb: COLOURS.muted } }
        excelRow.getCell('visible').fill = fill(COLOURS.greyTint)
        excelRow.getCell('name').font = { name: FONT, size: 10, color: { argb: COLOURS.muted } }
    }
    if (row.special === 'Yes') {
        excelRow.getCell('specialPrice').font = { name: FONT, size: 10, bold: true, color: { argb: COLOURS.pinkInk } }
    }
    if (row.featured === 'Yes') excelRow.getCell('featured').fill = fill(COLOURS.yellowTint)
    excelRow.getCell('code').font = { name: 'Consolas', size: 10, color: { argb: COLOURS.ink } }
    if (row.image) {
        excelRow.getCell('image').value = { text: 'View image', hyperlink: row.image }
        excelRow.getCell('image').font = { name: FONT, size: 10, underline: true, color: { argb: 'FF2563EB' } }
    }
}

// The products, organised like the store: each category (in tree order) with a heading row and its products
// underneath, subcategories after it. Categories without products anywhere beneath them are left out. Every
// category is an Excel group, so a whole branch can be collapsed with the +/- buttons in the margin.
function buildProductsSheet(workbook, rows, index, counts, subtitle) {
    const sheet = workbook.addWorksheet('Products', {
        properties: { tabColor: { argb: COLOURS.pink } },
        views: [{ state: 'frozen', ySplit: 5, xSplit: 0, showGridLines: false }],
        // landscape A4 at a scale that fits all the columns across. Not "fit to page": together with row groups
        // ExcelJS writes that in an order Excel rejects.
        pageSetup: { orientation: 'landscape', paperSize: 9, scale: 60 },
    })
    useGroupsWithHeadingsAbove(sheet)
    sheet.columns = PRODUCT_COLUMNS.map(({ key, width }) => ({ key, width }))
    addTitle(sheet, PRODUCT_COLUMNS.length, 'Pentique product catalogue', subtitle)

    // Row 4 is a small gap, row 5 the column headings
    sheet.getRow(4).height = 8
    const header = sheet.getRow(5)
    PRODUCT_COLUMNS.forEach((column, i) => (header.getCell(i + 1).value = column.header))
    styleHeaderRow(header)

    const byCategory = new Map()
    rows.forEach(row => {
        const list = byCategory.get(row.categoryID) || []
        list.push(row)
        byCategory.set(row.categoryID, list)
    })

    const walk = (nodes, trail) =>
        nodes.forEach(node => {
            const depth = trail.length
            addCategoryHeading(sheet, trail, node, depth)
            ;(byCategory.get(node.id) || []).forEach((row, i) => addProductRow(sheet, row, depth, i % 2 === 1))
            walk(node.subcategories, [...trail, node.name])
        })
    walk(buildTree(index, counts, true), [])
    declareOutlineLevels(sheet)

    // Print the headings on every page
    sheet.pageSetup.printTitlesRow = '5:5'
    return sheet
}

function buildCategoriesSheet(workbook, index, counts, subtitle) {
    const sheet = workbook.addWorksheet('Categories', {
        properties: { tabColor: { argb: COLOURS.blue } },
        views: [{ state: 'frozen', ySplit: 5, showGridLines: false }],
    })
    const columns = [
        { header: 'Category', width: 44 },
        { header: 'Full path', width: 56 },
        { header: 'Level', width: 8 },
        { header: 'Products in this category', width: 16 },
        { header: 'Products incl. subcategories', width: 17 },
        { header: 'Subcategories', width: 14 },
    ]
    useGroupsWithHeadingsAbove(sheet)
    sheet.columns = columns.map(({ width }) => ({ width }))
    addTitle(sheet, columns.length, 'Pentique categories', subtitle)
    sheet.getRow(4).height = 8
    const header = sheet.getRow(5)
    columns.forEach((column, i) => (header.getCell(i + 1).value = column.header))
    styleHeaderRow(header)

    const tree = buildTree(index, counts, false)
    const walk = (nodes, trail) =>
        nodes.forEach(node => {
            const depth = trail.length
            const row = sheet.addRow([
                node.name,
                [...trail, node.name].join(' › '),
                depth + 1,
                counts.get(node.id) || 0,
                node.productCount,
                node.subcategories.length,
            ])
            // Rows can be grouped seven levels deep in Excel, deeper ones share the deepest group
            row.outlineLevel = outlineLevel(depth)
            row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
                cell.font = { name: FONT, size: 10, color: { argb: COLOURS.ink } }
                cell.border = { bottom: thinRule }
                cell.alignment = { vertical: 'middle', horizontal: columnNumber > 2 ? 'center' : 'left' }
                if (columnNumber > 3) cell.numFmt = WHOLE
            })
            const name = row.getCell(1)
            name.alignment = { vertical: 'middle', indent: depth * 2 }
            if (depth === 0) {
                row.eachCell({ includeEmpty: true }, cell => (cell.fill = fill(COLOURS.blueTint)))
                name.font = { name: FONT, size: 11, bold: true, color: { argb: COLOURS.ink } }
            }
            row.getCell(2).font = { name: FONT, size: 10, color: { argb: COLOURS.muted } }
            if (node.productCount === 0) row.getCell(5).font = { name: FONT, size: 10, color: { argb: COLOURS.muted } }
            walk(node.subcategories, [...trail, node.name])
        })
    walk(tree, [])
    declareOutlineLevels(sheet)
    return sheet
}

function buildSummarySheet(workbook, products, rows, index, subtitle) {
    const sheet = workbook.addWorksheet('Summary', {
        properties: { tabColor: { argb: COLOURS.yellow } },
        views: [{ showGridLines: false }],
    })
    sheet.columns = [{ width: 34 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 18 }]
    addTitle(sheet, 6, 'Pentique product catalogue', subtitle)

    const totalValue = rows.reduce((sum, row) => sum + row.value, 0)
    const figures = [
        ['Products', products.length, WHOLE],
        ['Shown in the store', rows.filter(r => r.visible === 'Shown').length, WHOLE],
        ['Hidden from customers', rows.filter(r => r.visible === 'Hidden').length, WHOLE],
        ['In stock', rows.filter(r => r.stock > 0).length, WHOLE],
        ['Out of stock', rows.filter(r => r.stock === 0).length, WHOLE],
        ['On special', rows.filter(r => r.special === 'Yes').length, WHOLE],
        ['Categories', index.byID.size, WHOLE],
        ['Units in stock', rows.reduce((sum, r) => sum + r.stock, 0), WHOLE],
        ['Stock value (at current selling prices)', totalValue, RAND],
    ]

    let rowNumber = 5
    sheet.getCell(rowNumber, 1).value = 'At a glance'
    sheet.getCell(rowNumber, 1).font = { name: FONT, size: 13, bold: true, color: { argb: COLOURS.ink } }
    rowNumber++
    figures.forEach(([label, value, numFmt], i) => {
        const labelCell = sheet.getCell(rowNumber, 1)
        const valueCell = sheet.getCell(rowNumber, 2)
        labelCell.value = label
        valueCell.value = value
        valueCell.numFmt = numFmt
        for (const cell of [labelCell, valueCell]) {
            cell.font = { name: FONT, size: 11, color: { argb: COLOURS.ink } }
            cell.border = { bottom: thinRule }
            if (i % 2 === 1) cell.fill = fill(COLOURS.band)
        }
        valueCell.font = { name: FONT, size: 11, bold: true, color: { argb: COLOURS.ink } }
        valueCell.alignment = { horizontal: 'right' }
        rowNumber++
    })
    // stock value spans two columns, it is the widest figure
    sheet.mergeCells(rowNumber - 1, 2, rowNumber - 1, 3)

    rowNumber += 2
    sheet.getCell(rowNumber, 1).value = 'By top-level category'
    sheet.getCell(rowNumber, 1).font = { name: FONT, size: 13, bold: true, color: { argb: COLOURS.ink } }
    rowNumber++
    const header = sheet.getRow(rowNumber)
    ;['Category', 'Products', 'In store', 'Out of stock', 'Units in stock', 'Stock value'].forEach(
        (title, i) => (header.getCell(i + 1).value = title),
    )
    styleHeaderRow(header)
    rowNumber++

    const byTop = new Map()
    rows.forEach(row => {
        const entry = byTop.get(row.top) || { products: 0, shown: 0, out: 0, units: 0, value: 0 }
        entry.products++
        if (row.visible === 'Shown') entry.shown++
        if (row.stock === 0) entry.out++
        entry.units += row.stock
        entry.value += row.value
        byTop.set(row.top, entry)
    })
    const firstDataRow = rowNumber
    ;[...byTop.entries()]
        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
        .forEach(([top, entry], i) => {
            const row = sheet.getRow(rowNumber++)
            row.values = [top, entry.products, entry.shown, entry.out, entry.units, entry.value]
            row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
                cell.font = { name: FONT, size: 10, color: { argb: COLOURS.ink } }
                cell.border = { bottom: thinRule }
                cell.numFmt = columnNumber === 6 ? RAND : WHOLE
                if (i % 2 === 1) cell.fill = fill(COLOURS.band)
                if (columnNumber > 1) cell.alignment = { horizontal: 'right' }
            })
            if (entry.out > 0) row.getCell(4).font = { name: FONT, size: 10, color: { argb: COLOURS.redInk } }
        })

    // Totals, as formulas so they stay right if the sheet is edited. The result is stored too, for viewers that do
    // not calculate formulas (phone previews, some online viewers).
    const sums = [...byTop.values()].reduce(
        (total, entry) => [
            total[0] + entry.products,
            total[1] + entry.shown,
            total[2] + entry.out,
            total[3] + entry.units,
            total[4] + entry.value,
        ],
        [0, 0, 0, 0, 0],
    )
    const totals = sheet.getRow(rowNumber)
    totals.getCell(1).value = 'Total'
    for (let column = 2; column <= 6; column++) {
        const letter = String.fromCharCode(64 + column)
        totals.getCell(column).value = {
            formula: `SUM(${letter}${firstDataRow}:${letter}${rowNumber - 1})`,
            result: Math.round(sums[column - 2] * 100) / 100,
        }
        totals.getCell(column).numFmt = column === 6 ? RAND : WHOLE
        totals.getCell(column).alignment = { horizontal: 'right' }
    }
    totals.eachCell({ includeEmpty: true }, cell => {
        cell.font = { name: FONT, size: 11, bold: true, color: { argb: COLOURS.ink } }
        cell.border = { top: { style: 'medium', color: { argb: COLOURS.header } } }
    })
    return sheet
}

// products: getAllProductsForExport(), index: getCategoryIndex(), imagesUrl: e.g. https://api.pentique.co.za/images
export function buildCatalogueWorkbook(products, index, imagesUrl, now = new Date()) {
    const counts = new Map()
    products.forEach(p => counts.set(p.categoryID, (counts.get(p.categoryID) || 0) + 1))

    const rows = products
        .map(product => {
            const steps = categoryPath(index, product.categoryID).map(step => step.name)
            const images = productImages(product, imagesUrl)
            const stock = Number(product.productStock) || 0
            const onSpecial = Boolean(product.productSpecial) && Number(product.productSpecialPrice) > 0
            return {
                top: steps[0] || '',
                code: product.productCode || '',
                name: (product.productName || '').trim(),
                price: Number(product.productPrice) || 0,
                special: onSpecial ? 'Yes' : '',
                specialPrice: onSpecial ? Number(product.productSpecialPrice) : null,
                stock,
                status: stock > 0 ? 'In stock' : 'Out of stock',
                value: Math.round(stock * sellingPrice(product) * 100) / 100,
                visible: product.productHidden ? 'Hidden' : 'Shown',
                featured: product.productFeatured ? 'Yes' : '',
                description: plainText(product.productDescription),
                images: images.length,
                image: images[0] || '',
                id: product.productID,
                categoryID: product.categoryID,
            }
        })
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))

    const subtitle = `Exported ${exportedAt(now)} · ${products.length} products in ${index.byID.size} categories`

    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Pentique'
    workbook.created = now
    workbook.title = 'Pentique product catalogue'
    buildSummarySheet(workbook, products, rows, index, subtitle)
    buildProductsSheet(workbook, rows, index, counts, subtitle)
    buildCategoriesSheet(workbook, index, counts, subtitle)
    return workbook
}

// e.g. pentique-catalogue-2026-09-24.xlsx (the date in South Africa)
export const catalogueFileName = (now = new Date()) =>
    `pentique-catalogue-${new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(now)}.xlsx`
