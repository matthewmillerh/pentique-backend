// Run from the server directory: NODE_ENV=development npm test
// Builds a catalogue workbook from made up products (no database rows are read or written) and reads it back.
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import JSZip from 'jszip' // comes with ExcelJS, used here to look inside the generated file
import db from '../config/database.js'
import { indexCategories } from '../models/categoryModel.js'
import { buildCatalogueWorkbook, catalogueFileName } from '../utils/catalogueExport.js'

const index = indexCategories([
    { categoryID: 1, parentCategoryID: null, categoryName: 'Toys' },
    { categoryID: 2, parentCategoryID: 1, categoryName: 'Cars' },
    { categoryID: 3, parentCategoryID: 2, categoryName: 'Hot Wheels' },
    { categoryID: 4, parentCategoryID: null, categoryName: 'Books' },
])

const product = fields => ({
    productName: 'Product',
    productCode: 'C1',
    productPrice: 10,
    productSpecial: 0,
    productSpecialPrice: 0,
    productStock: 1,
    productHidden: 0,
    productFeatured: 0,
    productDescription: '',
    productImage0: '',
    productImage1: '',
    productImage2: '',
    productImage3: '',
    ...fields,
})

const products = [
    product({ productID: 900001, productName: 'Porsche 911', categoryID: 3, productPrice: 50, productStock: 3,
        productDescription: 'Silver Series<br/>1:64 &amp; boxed <br/ Great buy' }),
    product({ productID: 900002, productName: 'Datsun 510', categoryID: 3, productStock: 0, productHidden: 1 }),
    product({ productID: 900003, productName: 'A book', categoryID: 4, productPrice: 100, productStock: 2,
        productSpecial: 1, productSpecialPrice: 80, productFeatured: 1 }),
]

// the workbook as Excel would read it
const readBack = async () => {
    const built = buildCatalogueWorkbook(products, index, 'http://example.test/images', new Date('2026-09-24T12:00:00Z'))
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await built.xlsx.writeBuffer())
    return workbook
}

describe('catalogue export', () => {
    after(() => db.end())

    test('has a summary, products and categories sheet', async () => {
        const workbook = await readBack()
        assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Summary', 'Products', 'Categories'])
    })

    // The rows under the column headings: category headings as their text, products by name, with their group level
    const productsSheetRows = async () => {
        const sheet = (await readBack()).getWorksheet('Products')
        const rows = []
        sheet.eachRow((row, number) => {
            if (number <= 5) return
            const first = row.getCell(1).value
            rows.push(
                first && first.richText
                    ? { heading: first.richText.map(part => part.text).join(''), level: row.outlineLevel || 0 }
                    : { product: row.getCell('B').value, level: row.outlineLevel || 0, row },
            )
        })
        return rows
    }

    test('lists the products under their category, in the order of the category tree', async () => {
        const rows = await productsSheetRows()
        assert.deepEqual(
            rows.map(({ heading, product, level }) => (heading ? `# ${heading}` : product) + ` @${level}`),
            [
                '# Books   ·   1 product @0',
                'A book @1',
                '# Toys   ·   2 products @0',
                '# Toys › Cars   ·   2 products @1',
                '# Toys › Cars › Hot Wheels   ·   2 products @2',
                'Datsun 510 @3',
                'Porsche 911 @3',
            ],
        )
    })

    test('shows every product, hidden ones too, with all of its details', async () => {
        const products = Object.fromEntries(
            (await productsSheetRows()).filter(r => r.product).map(r => [r.row.getCell('N').value, r.row]),
        )

        const porsche = products[900001]
        assert.equal(porsche.getCell('F').value, 3)
        assert.equal(porsche.getCell('H').value, 150) // stock value: 3 at R50
        // HTML turned into text, including a <br/ with its > missing
        assert.equal(porsche.getCell('K').value, 'Silver Series\n1:64 & boxed\nGreat buy')

        const datsun = products[900002]
        assert.equal(datsun.getCell('G').value, 'Out of stock')
        assert.equal(datsun.getCell('I').value, 'Hidden')

        const book = products[900003]
        assert.equal(book.getCell('D').value, 'Yes')
        assert.equal(book.getCell('E').value, 80)
        assert.equal(book.getCell('H').value, 160) // stock value at the special price
        assert.equal(book.getCell('J').value, 'Yes')
    })

    test('has frozen column headings with room for two lines on every sheet', async () => {
        const workbook = await readBack()
        const products = workbook.getWorksheet('Products')
        assert.equal(products.getRow(5).getCell(1).value, 'Code')
        assert.equal(products.views[0].ySplit, 5)
        for (const sheet of workbook.worksheets) {
            sheet.eachRow(row => {
                if (row.getCell(1).fill?.fgColor?.argb === 'FF3E6A93') assert.ok(row.height >= 30, sheet.name)
            })
        }
    })

    test('shows the category tree with product counts that include subcategories', async () => {
        const sheet = (await readBack()).getWorksheet('Categories')
        const rows = []
        sheet.eachRow((row, number) => {
            if (number > 5) rows.push([row.getCell(1).value, row.outlineLevel || 0, row.getCell(5).value])
        })
        assert.deepEqual(rows, [
            ['Books', 0, 1],
            ['Toys', 0, 2],
            ['Cars', 1, 2],
            ['Hot Wheels', 2, 2],
        ])
    })

    test('summarises the catalogue', async () => {
        const sheet = (await readBack()).getWorksheet('Summary')
        const figures = {}
        for (let row = 6; row <= 14; row++) figures[sheet.getCell(row, 1).value] = sheet.getCell(row, 2).value
        assert.equal(figures['Products'], 3)
        assert.equal(figures['Hidden from customers'], 1)
        assert.equal(figures['Out of stock'], 1)
        assert.equal(figures['Units in stock'], 5)
        assert.equal(figures['Stock value (at current selling prices)'], 310)
    })

    // Excel (unlike more forgiving spreadsheet apps) offers to "repair" a file that breaks these rules
    test('writes sheets that Microsoft Excel opens without repairing them', async () => {
        const built = buildCatalogueWorkbook(products, index, 'http://example.test/images')
        const zip = await JSZip.loadAsync(await built.xlsx.writeBuffer())
        const sheets = Object.keys(zip.files).filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
        assert.equal(sheets.length, 3)

        for (const name of sheets) {
            const xml = await zip.file(name).async('string')

            // rows in a group that is not actually collapsed must not be flagged as collapsed
            assert.ok(!xml.includes('collapsed="1"'), `${name}: rows flagged as collapsed`)

            // the sheet declares at least as many group levels as its rows use, and no more than Excel allows
            const declared = Number(/outlineLevelRow="(\d+)"/.exec(xml)?.[1] || 0)
            const used = Math.max(0, ...[...xml.matchAll(/<row [^>]*outlineLevel="(\d+)"/g)].map(m => Number(m[1])))
            assert.ok(declared >= used, `${name}: declares ${declared} group levels but uses ${used}`)
            assert.ok(declared <= 7, `${name}: more than 7 group levels`)

            // the sheet settings have to come in the order the file format prescribes
            const sheetPr = /<sheetPr>([\s\S]*?)<\/sheetPr>/.exec(xml)?.[1] || ''
            const order = [...sheetPr.matchAll(/<(\w+)/g)].map(m => m[1])
            const allowed = ['tabColor', 'outlinePr', 'pageSetUpPr']
            assert.deepEqual(order, [...order].sort((a, b) => allowed.indexOf(a) - allowed.indexOf(b)), `${name}: ${order}`)
        }

        // no characters XML does not allow, in any part of the file
        for (const name of Object.keys(zip.files).filter(n => n.endsWith('.xml'))) {
            const xml = await zip.file(name).async('string')
            assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/.test(xml), `${name}: illegal character`)
        }
    })

    test('names the file after the date in South Africa', () => {
        // 23:30 UTC is already the next day in South Africa
        assert.equal(catalogueFileName(new Date('2026-09-24T23:30:00Z')), 'pentique-catalogue-2026-09-25.xlsx')
    })
})
