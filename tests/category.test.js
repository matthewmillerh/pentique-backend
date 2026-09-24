// Run from the server directory: NODE_ENV=development npm test
// The database tests create a throwaway "__test" category tree (and products) and remove it again.
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import db from '../config/database.js'
import {
    CategoryError,
    indexCategories,
    subtreeIDs,
    categoryPath,
    buildTree,
    getCategoryTree,
    getHomeCategories,
    getCategory,
    createCategory,
    renameCategory,
    moveCategory,
    mergeCategory,
    deleteCategory,
    resolveLegacyCategory,
} from '../models/categoryModel.js'
import { addProduct, getProductById, getProductsByCategory, updateProductById, moveProducts } from '../models/productModel.js'

describe('category helpers', () => {
    const rows = [
        { categoryID: 1, parentCategoryID: null, categoryName: 'Toys' },
        { categoryID: 2, parentCategoryID: 1, categoryName: 'Cars' },
        { categoryID: 3, parentCategoryID: 2, categoryName: 'Hot Wheels' },
        { categoryID: 4, parentCategoryID: 3, categoryName: 'Premium' },
        { categoryID: 5, parentCategoryID: null, categoryName: 'Books' },
    ]
    const index = indexCategories(rows)

    test('subtreeIDs includes the category and every descendant, at any depth', () => {
        assert.deepEqual(subtreeIDs(index, 1).sort(), [1, 2, 3, 4])
        assert.deepEqual(subtreeIDs(index, 4), [4])
    })

    test('categoryPath runs from the top level down', () => {
        assert.deepEqual(categoryPath(index, 4).map(c => c.name), ['Toys', 'Cars', 'Hot Wheels', 'Premium'])
        assert.deepEqual(categoryPath(index, 999), [])
    })

    test('buildTree nests to any depth, sorts by name and rolls product counts up', () => {
        const tree = buildTree(index, new Map([[4, 3], [5, 1]]), false)
        assert.deepEqual(tree.map(n => n.name), ['Books', 'Toys'])
        const premium = tree[1].subcategories[0].subcategories[0].subcategories[0]
        assert.equal(premium.name, 'Premium')
        assert.equal(tree[1].productCount, 3)
    })

    test('buildTree can prune categories without products', () => {
        const tree = buildTree(index, new Map([[4, 3]]), true)
        assert.deepEqual(tree.map(n => n.name), ['Toys'])
    })
})

describe('category changes (dev database)', () => {
    const createdProducts = []
    const rootIDs = []

    // helper: a scratch top level category, tracked so it is removed at the end
    const scratchRoot = async name => {
        const id = await createCategory(name, null)
        rootIDs.push(id)
        return id
    }

    const scratchProduct = async (categoryID, name, featured = 0) => {
        const result = await addProduct({
            productName: name,
            productDescription: '',
            productPrice: 1,
            productCode: null,
            productHidden: 0,
            productSpecial: 0,
            productSpecialPrice: 0,
            productStock: 1,
            productImage0: '',
            productImage1: '',
            productImage2: '',
            productImage3: '',
            categoryID,
            productFeatured: featured,
        })
        createdProducts.push(result.insertId)
        return result.insertId
    }

    const rejects = (promise, status) =>
        assert.rejects(promise, error => error instanceof CategoryError && error.status === status)

    before(async () => {
        // clean up leftovers of an aborted earlier run
        await db.query('DELETE FROM product WHERE productName LIKE "\\_\\_test%"')
        await db.query('DELETE FROM category WHERE categoryName LIKE "\\_\\_test%" AND parentCategoryID IS NULL')
    })

    after(async () => {
        if (createdProducts.length) await db.query('DELETE FROM product WHERE productID IN (?)', [createdProducts])
        for (const id of rootIDs) await db.query('DELETE FROM category WHERE categoryID = ?', [id])
        await db.end()
    })

    test('can nest categories far deeper than three levels and show the full path', async () => {
        const root = await scratchRoot('__test deep')
        let parent = root
        for (let level = 1; level <= 6; level++) parent = await createCategory(`level ${level}`, parent)

        const category = await getCategory(parent)
        assert.equal(category.path.length, 7)
        assert.equal(category.path[0].name, '__test deep')
    })

    test('rejects duplicate sibling names, including at the top level, but allows the same name elsewhere', async () => {
        const root = await scratchRoot('__test names')
        await createCategory('Small', root)
        await rejects(createCategory('small', root), 409)
        const other = await createCategory('Other', root)
        await createCategory('Small', other) // same name under a different parent is fine
        await rejects(createCategory('__TEST names', null), 409)
    })

    test('rename keeps names unique among siblings', async () => {
        const root = await scratchRoot('__test rename')
        const a = await createCategory('A', root)
        await createCategory('B', root)
        await rejects(renameCategory(a, 'b'), 409)
        await renameCategory(a, 'C')
        assert.equal((await getCategory(a)).name, 'C')
    })

    test('moving a category carries its subcategories and products with it', async () => {
        const root = await scratchRoot('__test move')
        const from = await createCategory('from', root)
        const child = await createCategory('child', from)
        const grandchild = await createCategory('grandchild', child)
        const dest = await createCategory('dest', root)
        const p1 = await scratchProduct(from, '__test product in from')
        const p2 = await scratchProduct(grandchild, '__test product in grandchild')

        await moveCategory(from, dest)

        assert.deepEqual((await getCategory(grandchild)).path.map(c => c.name), ['__test move', 'dest', 'from', 'child', 'grandchild'])
        // the products are still in their categories, which now live under dest, so nothing to re-assign
        assert.equal((await getProductById(p1)).categoryID, from)
        assert.equal((await getProductById(p2)).categoryID, grandchild)

        // listing the destination now includes both products
        const index = indexCategories((await db.query('SELECT categoryID, parentCategoryID, categoryName FROM category'))[0])
        const listed = (await getProductsByCategory(subtreeIDs(index, dest))).map(p => p.productID)
        assert.ok(listed.includes(p1) && listed.includes(p2))
    })

    test('can move a category to the top level and back under another', async () => {
        const root = await scratchRoot('__test toplevel')
        const child = await createCategory('__test promoted', root)
        rootIDs.push(child) // it becomes a top level category, so it needs cleaning up on its own
        await moveCategory(child, null)
        assert.equal((await getCategory(child)).path.length, 1)
        await moveCategory(child, root)
        assert.equal((await getCategory(child)).path.length, 2)
    })

    test('refuses to move a category into itself or its own descendant', async () => {
        const root = await scratchRoot('__test cycle')
        const a = await createCategory('a', root)
        const b = await createCategory('b', a)
        await rejects(moveCategory(a, a), 400)
        await rejects(moveCategory(a, b), 400)
        await rejects(moveCategory(root, b), 400)
    })

    test('refuses to move onto a parent that already has a category with that name', async () => {
        const root = await scratchRoot('__test clash')
        const a = await createCategory('a', root)
        const dest = await createCategory('dest', root)
        await createCategory('a', dest)
        await rejects(moveCategory(a, dest), 409)
    })

    test('merging moves products and subcategories across, and merges same-named subcategories', async () => {
        const root = await scratchRoot('__test merge')
        const source = await createCategory('LEGO Formula 1 Collectable', root)
        const target = await createCategory('LEGO Formula 1 Collectables', root)
        const sharedS = await createCategory('Box', source)
        const sharedT = await createCategory('Box', target)
        const onlyS = await createCategory('Only in source', source)
        const pSource = await scratchProduct(source, '__test merge source product')
        const pShared = await scratchProduct(sharedS, '__test merge shared product')
        const pOnly = await scratchProduct(onlyS, '__test merge only product')

        const stats = await mergeCategory(source, target)

        assert.equal(await getCategory(source), null)
        assert.equal(await getCategory(sharedS), null)
        assert.equal((await getProductById(pSource)).categoryID, target)
        assert.equal((await getProductById(pShared)).categoryID, sharedT)
        assert.equal((await getProductById(pOnly)).categoryID, onlyS)
        assert.equal((await getCategory(onlyS)).path.at(-2).id, target)
        assert.equal(stats.products, 2) // pSource and pShared change category, pOnly stays in its (re-parented) category
    })

    test('merging keeps a single featured product per category', async () => {
        const root = await scratchRoot('__test featured')
        const source = await createCategory('source', root)
        const target = await createCategory('target', root)
        const keep = await scratchProduct(target, '__test featured keep', 1)
        const drop = await scratchProduct(source, '__test featured drop', 1)

        await mergeCategory(source, target)

        assert.equal((await getProductById(keep)).productFeatured, 1)
        assert.equal((await getProductById(drop)).productFeatured, 0)
    })

    test('refuses to merge a category into itself or its own subcategory', async () => {
        const root = await scratchRoot('__test mergecycle')
        const a = await createCategory('a', root)
        const b = await createCategory('b', a)
        await rejects(mergeCategory(a, a), 400)
        await rejects(mergeCategory(a, b), 400)
    })

    test('a failed merge changes nothing', async () => {
        const root = await scratchRoot('__test rollback')
        const a = await createCategory('a', root)
        await scratchProduct(a, '__test rollback product')
        await assert.rejects(mergeCategory(a, 999999999))
        assert.ok(await getCategory(a))
    })

    test('editing a product can move it to a different category', async () => {
        const root = await scratchRoot('__test edit')
        const one = await createCategory('one', root)
        const two = await createCategory('two', root)
        const id = await scratchProduct(one, '__test editable')
        const product = await getProductById(id)

        await updateProductById({ ...product, categoryID: two })

        assert.equal((await getProductById(id)).categoryID, two)
    })

    test('moving selected products moves only those products', async () => {
        const root = await scratchRoot('__test bulk move')
        const from = await createCategory('from', root)
        const to = await createCategory('to', root)
        const a = await scratchProduct(from, '__test bulk a')
        const b = await scratchProduct(from, '__test bulk b')
        const stays = await scratchProduct(from, '__test bulk stays')

        assert.equal(await moveProducts([a, b], to), 2)

        assert.equal((await getProductById(a)).categoryID, to)
        assert.equal((await getProductById(b)).categoryID, to)
        assert.equal((await getProductById(stays)).categoryID, from)
    })

    test('moving products keeps a single featured product in the destination', async () => {
        const root = await scratchRoot('__test bulk featured')
        // featured is one per category, so the two featured products start out in different categories
        const from1 = await createCategory('from 1', root)
        const from2 = await createCategory('from 2', root)
        const unfeatured = await createCategory('without featured', root)
        const full = await createCategory('with featured', root)
        const f1 = await scratchProduct(from1, '__test bulk f1', 1)
        const f2 = await scratchProduct(from2, '__test bulk f2', 1)
        const existing = await scratchProduct(full, '__test bulk existing', 1)

        // two featured products into a category without one: the first keeps its flag
        await moveProducts([f1, f2], unfeatured)
        assert.equal((await getProductById(f1)).productFeatured, 1)
        assert.equal((await getProductById(f2)).productFeatured, 0)

        // into a category that already has a featured product: the moved one loses its flag
        await moveProducts([f1], full)
        assert.equal((await getProductById(f1)).productFeatured, 0)
        assert.equal((await getProductById(existing)).productFeatured, 1)
    })

    test('a category holding products (even deep down) cannot be deleted, an empty one can with its subcategories', async () => {
        const root = await scratchRoot('__test delete')
        const branch = await createCategory('branch', root)
        const leaf = await createCategory('leaf', branch)
        const id = await scratchProduct(leaf, '__test delete product')

        await rejects(deleteCategory(branch), 409)
        assert.ok(await getCategory(leaf))

        await db.query('DELETE FROM product WHERE productID = ?', [id])
        assert.equal(await deleteCategory(branch), 2)
        assert.equal(await getCategory(leaf), null)
    })

    test('the database itself refuses to drop a category that still has products', async () => {
        const root = await scratchRoot('__test fk')
        await scratchProduct(root, '__test fk product')
        await assert.rejects(db.query('DELETE FROM category WHERE categoryID = ?', [root]))
    })

    test('public tree hides empty and hidden-only categories, admin tree shows everything', async () => {
        const root = await scratchRoot('__test tree')
        const empty = await createCategory('empty', root)
        const hidden = await createCategory('hidden only', root)
        const visible = await createCategory('visible', root)
        const hiddenProduct = await scratchProduct(hidden, '__test hidden product')
        await db.query('UPDATE product SET productHidden = 1 WHERE productID = ?', [hiddenProduct])
        await scratchProduct(visible, '__test visible product')

        const names = tree => tree.flatMap(n => [n.name, ...names(n.subcategories)])
        const publicNames = names(await getCategoryTree())
        const adminNames = names(await getCategoryTree({ admin: true }))

        assert.ok(publicNames.includes('visible'))
        assert.ok(!publicNames.includes('empty') && !publicNames.includes('hidden only'))
        assert.ok(adminNames.includes('empty') && adminNames.includes('hidden only'))
        assert.ok(empty && hidden)
    })

    test('home tiles: one per top level category, using a featured product from anywhere beneath it', async () => {
        const root = await scratchRoot('__test home')
        const deep = await createCategory('a', await createCategory('b', root))
        const id = await scratchProduct(deep, '__test home featured', 1)

        const tiles = (await getHomeCategories()).filter(t => t.categoryID === root)
        assert.equal(tiles.length, 1)
        assert.equal(tiles[0].productID, id)
        assert.equal(tiles[0].categoryName, '__test home')
    })

    test('legacy /products/<name>/<top level id> links resolve to the right category', async () => {
        const root = await scratchRoot('__test legacy')
        const a = await createCategory('Gift Bags', root)
        const b = await createCategory('Small', a)

        assert.equal(await resolveLegacyCategory(root, '__test legacy'), root)
        assert.equal(await resolveLegacyCategory(root, 'small'), b)
        assert.equal(await resolveLegacyCategory(root, 'Nothing'), null)
    })
})
