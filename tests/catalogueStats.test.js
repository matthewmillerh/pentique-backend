// Run from the server directory: NODE_ENV=development npm test
// Works out the stats for made up products (no database rows are read or written).
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import db from '../config/database.js'
import { indexCategories } from '../models/categoryModel.js'
import { buildCatalogueStats } from '../utils/catalogueStats.js'

const index = indexCategories([
    { categoryID: 1, parentCategoryID: null, categoryName: 'Toys' },
    { categoryID: 2, parentCategoryID: 1, categoryName: 'Cars' },
    { categoryID: 3, parentCategoryID: 2, categoryName: 'Hot Wheels' },
    { categoryID: 4, parentCategoryID: null, categoryName: 'Books' },
    { categoryID: 5, parentCategoryID: 4, categoryName: 'Empty shelf' },
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
    productDescription: 'Something',
    productImage0: 'a.jpg',
    productImage1: '',
    productImage2: '',
    productImage3: '',
    ...fields,
})

const products = [
    product({ productID: 1, productName: 'Porsche', productCode: 'HW1', categoryID: 3, productPrice: 50, productStock: 3 }),
    product({ productID: 2, productName: 'Datsun', productCode: 'hw1', categoryID: 3, productPrice: 40, productStock: 0,
        productHidden: 1, productDescription: '<br/>' }),
    product({ productID: 3, productName: 'Kite', productCode: '', categoryID: 1, productPrice: 700, productStock: 1,
        productImage0: '', productImage1: '0' }), // old products hold '0' for no image
    product({ productID: 4, productName: 'Atlas', productCode: 'B1', categoryID: 4, productPrice: 100, productStock: 2,
        productSpecial: 1, productSpecialPrice: 80, productFeatured: 1 }),
    product({ productID: 5, productName: 'Diary', productCode: 'B2', categoryID: 4, productPrice: 0, productStock: 12,
        productHidden: 1, productSpecial: 1, productSpecialPrice: 0 }),
]

const stats = buildCatalogueStats(products, index, { checkImages: false, now: new Date('2026-09-24T10:00:00Z') })

describe('catalogue stats', () => {
    after(() => db.end())

    test('totals count products, stock and its value at the current selling price', () => {
        const t = stats.totals
        assert.equal(t.products, 5)
        assert.equal(t.shown, 3)
        assert.equal(t.hidden, 2)
        assert.equal(t.inStock, 4)
        assert.equal(t.outOfStock, 1)
        assert.equal(t.units, 18)
        // 3 × 50 + 1 × 700 + 2 × 80 (on special) + 12 × 0
        assert.equal(t.sellingValue, 1010)
        assert.equal(t.listValue, 1050)
        assert.equal(t.specialDiscount, 40)
        assert.equal(t.shownValue, 1010)
        assert.equal(t.onSpecial, 2)
        assert.equal(t.featured, 1)
        assert.equal(t.averagePrice, 178)
        assert.equal(t.medianPrice, 50)
        assert.equal(t.minPrice, 0)
        assert.equal(t.maxPrice, 700)
        assert.equal(t.categories, 5)
        assert.equal(t.emptyCategories, 1)
        assert.equal(stats.generatedAt, '2026-09-24T10:00:00.000Z')
    })

    test('categories add up everything beneath them, to any depth', () => {
        const [books, toys] = stats.categories
        assert.equal(toys.name, 'Toys')
        assert.equal(toys.products, 3)
        assert.equal(toys.directProducts, 1)
        assert.equal(toys.units, 4)
        assert.equal(toys.value, 850)

        const hotWheels = toys.subcategories[0].subcategories[0]
        assert.equal(hotWheels.name, 'Hot Wheels')
        assert.equal(hotWheels.products, 2)
        assert.equal(hotWheels.shown, 1)
        assert.equal(hotWheels.inStock, 1)
        assert.equal(hotWheels.value, 150)

        assert.equal(books.value, 160)
        assert.equal(books.listValue, 200)
        assert.equal(books.onSpecial, 2)
        // the category totals match the catalogue totals
        assert.equal(books.value + toys.value, stats.totals.sellingValue)
    })

    test('products are spread over price bands and stock levels', () => {
        const priceCounts = stats.priceBands.map(band => [band.min, band.max, band.products])
        assert.deepEqual(priceCounts, [
            [0, 50, 2],
            [50, 100, 1],
            [100, 200, 1],
            [200, 500, 0],
            [500, 1000, 1],
            [1000, null, 0],
        ])
        const stockCounts = stats.stockLevels.map(level => [level.min, level.max, level.products])
        assert.deepEqual(stockCounts, [
            [0, 0, 1],
            [1, 1, 1],
            [2, 5, 2],
            [6, 10, 0],
            [11, null, 1],
        ])
        assert.equal(stats.priceBands.reduce((total, band) => total + band.value, 0), stats.totals.sellingValue)
    })

    test('top lists are sorted and only hold products that have what they rank', () => {
        assert.deepEqual(stats.top.value.map(p => p.name), ['Kite', 'Atlas', 'Porsche'])
        assert.deepEqual(stats.top.units.map(p => p.name), ['Diary', 'Porsche', 'Atlas', 'Kite'])
        assert.equal(stats.top.price[0].name, 'Kite')
        assert.equal(stats.top.value[2].category, 'Toys › Cars › Hot Wheels')
    })

    test('flags the products and categories that need attention', () => {
        const names = check => stats.attention[check].products.map(p => p.name)
        assert.deepEqual(names('noImage'), ['Kite'])
        assert.deepEqual(names('noDescription'), ['Datsun'])
        assert.deepEqual(names('noCode'), ['Kite'])
        // codes are compared without caring about capitals
        assert.deepEqual(names('duplicateCodes'), ['Datsun', 'Porsche'])
        assert.deepEqual(names('noPrice'), ['Diary'])
        assert.deepEqual(names('badSpecial'), ['Diary'])
        assert.deepEqual(names('hiddenWithStock'), ['Diary'])
        assert.deepEqual(names('shownOutOfStock'), [])
        assert.deepEqual(stats.attention.emptyCategories.categories, [
            { id: 5, name: 'Empty shelf', path: 'Books › Empty shelf' },
        ])
    })

    test('an empty catalogue gives zeros, not errors', () => {
        const empty = buildCatalogueStats([], indexCategories([]), { checkImages: false })
        assert.equal(empty.totals.products, 0)
        assert.equal(empty.totals.averagePrice, 0)
        assert.equal(empty.totals.medianPrice, 0)
        assert.equal(empty.totals.averageUnitValue, 0)
        assert.deepEqual(empty.categories, [])
    })
})
