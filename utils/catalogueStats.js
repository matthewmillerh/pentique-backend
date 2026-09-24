// Works out the figures for the admin Stats page from the whole catalogue: totals, stock values, price and stock
// spreads, a breakdown per category (to any depth), the top products and things that need attention.
// Stock value is what the stock is worth at the shop's prices (there are no cost prices in the database).
import { categoryPath } from '../models/categoryModel.js'
import { plainText, productImages, sellingPrice } from './catalogueExport.js'

// Upper limits of the price bands, in rand (the last band has no upper limit)
export const PRICE_BANDS = [50, 100, 200, 500, 1000]
// Upper limits of the stock level bands, in units (0 is its own band: out of stock)
export const STOCK_LEVELS = [0, 1, 5, 10]
// Longest list of products sent for one "needs attention" check or top list
export const LIST_LIMIT = 200
const TOP_LIMIT = 10

const hasImageName = name => Boolean(name) && name !== '0'

const round2 = value => Math.round(value * 100) / 100

// [0, 50) [50, 100) ... [1000, ∞) as { min, max } with max null for the open ended band
const bands = limits =>
    [...limits, null].map((max, i) => ({ min: i === 0 ? 0 : limits[i - 1], max }))

const median = sorted => {
    if (!sorted.length) return 0
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function buildCatalogueStats(products, index, { checkImages = true, now = new Date() } = {}) {
    const pathNames = new Map()
    const pathOf = categoryID => {
        if (!pathNames.has(categoryID)) {
            pathNames.set(categoryID, categoryPath(index, categoryID).map(step => step.name).join(' › '))
        }
        return pathNames.get(categoryID)
    }

    const rows = products.map(product => {
        const price = Number(product.productPrice) || 0
        const selling = sellingPrice(product) || 0
        const stock = Number(product.productStock) || 0
        // old products hold '0' in the image slots they do not use
        const namedImages = [0, 1, 2, 3].filter(slot => hasImageName(product[`productImage${slot}`])).length
        return {
            id: product.productID,
            name: product.productName || '',
            code: (product.productCode || '').trim(),
            categoryID: product.categoryID,
            category: pathOf(product.categoryID),
            price,
            selling,
            stock,
            value: round2(selling * stock),
            listValue: round2(price * stock),
            hidden: Boolean(Number(product.productHidden)),
            special: Boolean(Number(product.productSpecial)),
            specialPrice: Number(product.productSpecialPrice) || 0,
            featured: Boolean(Number(product.productFeatured)),
            namedImages,
            // images that are named in the database but whose files are gone count as missing
            images: checkImages && namedImages ? productImages(product, '').length : namedImages,
            hasDescription: plainText(product.productDescription).length > 0,
        }
    })

    // What the page lists for a product: enough to recognise it and open its category in the editor
    const brief = row => ({
        id: row.id,
        name: row.name,
        code: row.code,
        categoryID: row.categoryID,
        category: row.category,
        price: row.price,
        selling: row.selling,
        stock: row.stock,
        value: row.value,
        hidden: row.hidden,
    })

    const sum = (list, field) => list.reduce((total, row) => total + row[field], 0)
    const prices = rows.map(row => row.price).sort((a, b) => a - b)
    const units = sum(rows, 'stock')
    const sellingValue = round2(sum(rows, 'value'))
    const listValue = round2(sum(rows, 'listValue'))
    const shown = rows.filter(row => !row.hidden)
    const inStock = rows.filter(row => row.stock > 0)

    // Per category, everything beneath it included
    const direct = new Map()
    rows.forEach(row => {
        const list = direct.get(row.categoryID) || []
        list.push(row)
        direct.set(row.categoryID, list)
    })
    const emptyCategories = []
    const categoryNode = category => {
        const subcategories = (index.childrenOf.get(category.categoryID) || []).map(categoryNode)
        const own = direct.get(category.categoryID) || []
        const node = {
            id: category.categoryID,
            name: category.categoryName,
            directProducts: own.length,
            products: own.length,
            shown: own.filter(row => !row.hidden).length,
            inStock: own.filter(row => row.stock > 0).length,
            onSpecial: own.filter(row => row.special).length,
            units: sum(own, 'stock'),
            value: sum(own, 'value'),
            listValue: sum(own, 'listValue'),
            subcategories,
        }
        for (const sub of subcategories) {
            for (const field of ['products', 'shown', 'inStock', 'onSpecial', 'units', 'value', 'listValue']) {
                node[field] += sub[field]
            }
        }
        node.value = round2(node.value)
        node.listValue = round2(node.listValue)
        if (!node.products) emptyCategories.push({ id: node.id, name: node.name, path: pathOf(node.id) })
        return node
    }
    const categories = (index.childrenOf.get(null) || []).map(categoryNode)

    const spread = (limits, field) =>
        bands(limits).map(band => {
            const inBand = rows.filter(row => row[field] >= band.min && (band.max === null || row[field] < band.max))
            return { ...band, products: inBand.length, units: sum(inBand, 'stock'), value: round2(sum(inBand, 'value')) }
        })
    // stock levels are whole units, so the bands are 0 | 1 | 2-5 | 6-10 | 11+ (max is inclusive here)
    const stockLevels = [...STOCK_LEVELS, null].map((max, i) => {
        const min = i === 0 ? 0 : STOCK_LEVELS[i - 1] + 1
        const inBand = rows.filter(row => row.stock >= min && (max === null || row.stock <= max))
        return { min, max, products: inBand.length, units: sum(inBand, 'stock'), value: round2(sum(inBand, 'value')) }
    })

    const top = (field, filter = () => true) =>
        rows
            .filter(filter)
            .sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name))
            .slice(0, TOP_LIMIT)
            .map(brief)

    const check = list => ({ count: list.length, products: list.slice(0, LIST_LIMIT).map(brief) })
    const byName = (a, b) => a.name.localeCompare(b.name)

    const codeOwners = new Map()
    rows.forEach(row => {
        if (!row.code) return
        const key = row.code.toLowerCase()
        codeOwners.set(key, [...(codeOwners.get(key) || []), row])
    })
    const duplicateCodes = [...codeOwners.values()]
        .filter(owners => owners.length > 1)
        .flat()
        .sort((a, b) => a.code.localeCompare(b.code) || byName(a, b))

    return {
        generatedAt: now.toISOString(),
        totals: {
            products: rows.length,
            shown: shown.length,
            hidden: rows.length - shown.length,
            inStock: inStock.length,
            outOfStock: rows.length - inStock.length,
            units,
            sellingValue,
            listValue,
            // what the stock of the products customers can see is worth
            shownValue: round2(sum(shown, 'value')),
            specialDiscount: round2(listValue - sellingValue),
            onSpecial: rows.filter(row => row.special).length,
            featured: rows.filter(row => row.featured).length,
            averagePrice: rows.length ? round2(sum(rows, 'price') / rows.length) : 0,
            medianPrice: round2(median(prices)),
            minPrice: prices[0] ?? 0,
            maxPrice: prices[prices.length - 1] ?? 0,
            averageUnitValue: units ? round2(sellingValue / units) : 0,
            categories: index.byID.size,
            emptyCategories: emptyCategories.length,
        },
        priceBands: spread(PRICE_BANDS, 'price'),
        stockLevels,
        categories,
        top: {
            value: top('value', row => row.value > 0),
            units: top('stock', row => row.stock > 0),
            price: top('price'),
        },
        attention: {
            noImage: check(rows.filter(row => !row.namedImages).sort(byName)),
            missingImageFiles: check(rows.filter(row => row.namedImages && row.images < row.namedImages).sort(byName)),
            noDescription: check(rows.filter(row => !row.hasDescription).sort(byName)),
            noCode: check(rows.filter(row => !row.code).sort(byName)),
            duplicateCodes: check(duplicateCodes),
            noPrice: check(rows.filter(row => row.price <= 0).sort(byName)),
            badSpecial: check(
                rows.filter(row => row.special && (row.specialPrice <= 0 || row.specialPrice >= row.price)).sort(byName),
            ),
            hiddenWithStock: check(rows.filter(row => row.hidden && row.stock > 0).sort(byName)),
            shownOutOfStock: check(rows.filter(row => !row.hidden && row.stock <= 0).sort(byName)),
            emptyCategories: {
                count: emptyCategories.length,
                categories: emptyCategories.sort((a, b) => a.path.localeCompare(b.path)).slice(0, LIST_LIMIT),
            },
        },
    }
}
