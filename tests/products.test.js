// Run from the server directory: NODE_ENV=development npm test
// Creates throwaway "__test" products in a scratch category and removes them again.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import db from '../config/database.js'
import { createCategory } from '../models/categoryModel.js'
import {
    addProduct,
    getProductById,
    updateProductById,
    updateProducts,
    deleteProducts,
    searchProducts,
    getNewArrivals,
} from '../models/productModel.js'

describe('bulk product changes (dev database)', () => {
    let categoryID
    const created = []

    const scratchProduct = async (name, fields = {}) => {
        const result = await addProduct({
            productName: name,
            productDescription: '',
            productPrice: 1,
            productCode: null,
            productHidden: 0,
            productSpecial: 0,
            productSpecialPrice: 0,
            productStock: 5,
            productImage0: '',
            productImage1: '',
            productImage2: '',
            productImage3: '',
            categoryID,
            productFeatured: 0,
            ...fields,
        })
        created.push(result.insertId)
        return result.insertId
    }

    before(async () => {
        // clean up leftovers of an aborted earlier run
        await db.query('DELETE FROM product WHERE productName LIKE "\\_\\_test products%"')
        await db.query('DELETE FROM category WHERE categoryName = "__test products" AND parentCategoryID IS NULL')
        categoryID = await createCategory('__test products', null)
    })

    after(async () => {
        if (created.length) await db.query('DELETE FROM product WHERE productID IN (?)', [created])
        await db.query('DELETE FROM category WHERE categoryID = ?', [categoryID])
        await db.end()
    })

    test('hides and shows only the given products', async () => {
        const a = await scratchProduct('__test products a')
        const b = await scratchProduct('__test products b')
        const untouched = await scratchProduct('__test products untouched')

        assert.equal(await updateProducts([a, b], { productHidden: 1 }), 2)
        assert.equal((await getProductById(a)).productHidden, 1)
        assert.equal((await getProductById(b)).productHidden, 1)
        assert.equal((await getProductById(untouched)).productHidden, 0)

        await updateProducts([a], { productHidden: 0 })
        assert.equal((await getProductById(a)).productHidden, 0)
        assert.equal((await getProductById(b)).productHidden, 1)
    })

    test('sets the stock of several products', async () => {
        const a = await scratchProduct('__test products stock a')
        const b = await scratchProduct('__test products stock b')

        await updateProducts([a, b], { productStock: 0 })
        assert.equal((await getProductById(a)).productStock, 0)
        assert.equal((await getProductById(b)).productStock, 0)

        await updateProducts([b], { productStock: 12 })
        assert.equal((await getProductById(b)).productStock, 12)
    })

    test('only whitelisted fields can be bulk updated', async () => {
        const a = await scratchProduct('__test products whitelist')
        await assert.rejects(updateProducts([a], { productPrice: 0 }))
        // an allowed field next to one that is not: only the allowed one is applied
        await updateProducts([a], { productStock: 3, productPrice: 0 })
        const product = await getProductById(a)
        assert.equal(product.productStock, 3)
        assert.equal(product.productPrice, 1)
    })

    test('search matches the name or the description, and skips hidden products', async () => {
        const byName = await scratchProduct('__test products Zyxqwe Lamp')
        const byDescription = await scratchProduct('__test products plain', {
            productDescription: 'A lovely <b>zyxqwe</b> gift<br/>for anyone',
        })
        const hidden = await scratchProduct('__test products zyxqwe hidden', { productHidden: 1 })

        const ids = (await searchProducts(['zyxqwe'], 'zyxqwe')).map(p => p.productID)

        assert.ok(ids.includes(byName) && ids.includes(byDescription))
        assert.ok(!ids.includes(hidden))
        // a name match is listed before a description-only match
        assert.ok(ids.indexOf(byName) < ids.indexOf(byDescription))
    })

    test('search needs every word, in the name or the description', async () => {
        const both = await scratchProduct('__test products Qwvbn Porsche', { productDescription: 'red kxjwq model' })
        const one = await scratchProduct('__test products Qwvbn Ferrari', { productDescription: 'blue model' })

        const ids = (await searchProducts(['qwvbn', 'kxjwq'], 'qwvbn kxjwq')).map(p => p.productID)

        assert.ok(ids.includes(both))
        assert.ok(!ids.includes(one))
    })

    test('search also matches the names of the product category and the categories above it', async () => {
        // a brand that only appears in the category names, like the Hot Wheels products
        const brand = await createCategory('Vrmqz Brand', categoryID)
        const series = await createCategory('Series Wkplo', brand)
        const inSeries = await scratchProduct('__test products 1971 Datsun', { categoryID: series })
        const elsewhere = await scratchProduct('__test products 1971 Datsun other')

        const byBrand = (await searchProducts(['vrmqz'], 'vrmqz')).map(p => p.productID)
        assert.deepEqual(byBrand, [inSeries])

        // words can be spread over the product name and its categories
        const mixed = (await searchProducts(['datsun', 'wkplo'], 'datsun wkplo')).map(p => p.productID)
        assert.deepEqual(mixed, [inSeries])
        assert.ok(!mixed.includes(elsewhere))
    })

    test('search lists products in a category named after the search before description-only matches', async () => {
        const bags = await createCategory('Plirv Bags', categoryID)
        // alphabetically first, but it only mentions the words in its description
        const mention = await scratchProduct('__test products A sticker', {
            productDescription: 'Great for decorating plirv bags',
        })
        const bag = await scratchProduct('__test products Z large bag', { categoryID: bags })

        const ids = (await searchProducts(['plirv', 'bags'], 'plirv bags')).map(p => p.productID)
        assert.deepEqual(ids, [bag, mention])
    })

    test('search ignores HTML in descriptions and treats % and _ as plain text', async () => {
        await scratchProduct('__test products html', { productDescription: 'line one<br/>line two' })
        const percent = await scratchProduct('__test products 50%_off pqzmw')

        assert.equal((await searchProducts(['<br/>'], '<br/>')).length, 0)
        assert.equal((await searchProducts(['%'], '%')).length, 1)
        assert.deepEqual((await searchProducts(['50%_off'], '50%_off')).map(p => p.productID), [percent])
    })

    test('deletes several products and reports which ones existed', async () => {
        const a = await scratchProduct('__test products delete a')
        const b = await scratchProduct('__test products delete b')
        const keep = await scratchProduct('__test products delete keep')

        const deleted = await deleteProducts([a, b, 999999999])

        assert.deepEqual(deleted.sort(), [a, b].sort())
        assert.equal(await getProductById(a), undefined)
        assert.equal(await getProductById(b), undefined)
        assert.ok(await getProductById(keep))
    })

    describe('productShownAt (when a product last became visible, for New Arrivals)', () => {
        // save a product back through updateProductById with just productHidden changed
        const setHidden = async (id, productHidden) => {
            const product = await getProductById(id)
            await updateProductById({ ...product, productHidden })
            return getProductById(id)
        }

        test('a product added visible is shown from the start; added hidden, it is not', async () => {
            const shown = await scratchProduct('__test products shown from add', { productHidden: 0 })
            const hidden = await scratchProduct('__test products hidden from add', { productHidden: 1 })

            assert.ok((await getProductById(shown)).productShownAt)
            assert.equal((await getProductById(hidden)).productShownAt, null)
        })

        test('unhiding a product sets productShownAt; saving it again while still shown leaves it alone', async () => {
            const id = await scratchProduct('__test products unhide', { productHidden: 1 })
            assert.equal((await getProductById(id)).productShownAt, null)

            const firstShown = (await setHidden(id, 0)).productShownAt
            assert.ok(firstShown)

            // re-saving unrelated fields while it is already shown must not bump the date
            const product = await getProductById(id)
            await updateProductById({ ...product, productName: '__test products unhide (renamed)' })
            assert.deepEqual((await getProductById(id)).productShownAt, firstShown)

            // hiding it again does not clear the date (it just stops mattering, since it is filtered out below)
            await setHidden(id, 1)
            assert.deepEqual((await getProductById(id)).productShownAt, firstShown)
        })

        test('bulk showing sets productShownAt only for the ones that were hidden', async () => {
            const wasHidden = await scratchProduct('__test products bulk unhide', { productHidden: 1 })
            const alreadyShown = await scratchProduct('__test products bulk already shown', { productHidden: 0 })
            const before = (await getProductById(alreadyShown)).productShownAt

            await updateProducts([wasHidden, alreadyShown], { productHidden: 0 })

            assert.ok((await getProductById(wasHidden)).productShownAt)
            assert.deepEqual((await getProductById(alreadyShown)).productShownAt, before)
        })

        test('New Arrivals lists only visible products shown in the last 7 days, newest first, and respects a limit', async () => {
            const recent = await scratchProduct('__test products arrival recent', { productHidden: 0 })
            const older = await scratchProduct('__test products arrival older', { productHidden: 0 })
            const stale = await scratchProduct('__test products arrival stale', { productHidden: 0 })
            const hiddenRecent = await scratchProduct('__test products arrival hidden', { productHidden: 1 })
            await setHidden(hiddenRecent, 0) // shown, but hidden again below - must not appear either way
            await updateProducts([hiddenRecent], { productHidden: 1 })

            // dates chosen so ordering between them can only be explained by productShownAt, not insertion order
            await db.query('UPDATE product SET productShownAt = NOW() WHERE productID = ?', [recent])
            await db.query('UPDATE product SET productShownAt = NOW() - INTERVAL 1 HOUR WHERE productID = ?', [older])
            await db.query('UPDATE product SET productShownAt = NOW() - INTERVAL 10 DAY WHERE productID = ?', [stale])

            // other test files add their own visible products concurrently against the same dev database, so this
            // only checks things that hold regardless of what else is in the catalogue at the time: that these
            // four specific products are (or are not) included, and that "recent" outranks "older"
            const ids = (await getNewArrivals()).map(p => p.productID)
            assert.ok(ids.includes(recent))
            assert.ok(ids.includes(older))
            assert.ok(!ids.includes(stale)) // outside the 7 day window
            assert.ok(!ids.includes(hiddenRecent)) // hidden again, regardless of its date
            assert.ok(ids.indexOf(recent) < ids.indexOf(older)) // newest first

            const limited = await getNewArrivals(1)
            assert.equal(limited.length, 1) // the limit is respected, whichever product currently ranks first
        })
    })
})
