//import db connection
import db, { executeQuery } from '../config/database.js'

// Error with an http status that the controllers pass straight on to the client
export class CategoryError extends Error {
    constructor(status, message) {
        super(message)
        this.name = 'CategoryError'
        this.status = status
    }
}

const byName = (a, b) => a.categoryName.localeCompare(b.categoryName, undefined, { numeric: true, sensitivity: 'base' })
const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase()

//
// Pure helpers that work on the flat list of categories ({ categoryID, parentCategoryID, categoryName })
//

// Index the flat list by id and by parent id
export const indexCategories = rows => {
    const byID = new Map()
    const childrenOf = new Map()
    rows.forEach(row => {
        byID.set(row.categoryID, row)
        const siblings = childrenOf.get(row.parentCategoryID) || []
        siblings.push(row)
        childrenOf.set(row.parentCategoryID, siblings)
    })
    childrenOf.forEach(siblings => siblings.sort(byName))
    return { byID, childrenOf }
}

// The id of a category and everything beneath it
export const subtreeIDs = (index, categoryID) => {
    const ids = []
    const stack = [categoryID]
    while (stack.length) {
        const id = stack.pop()
        ids.push(id)
        ;(index.childrenOf.get(id) || []).forEach(child => stack.push(child.categoryID))
    }
    return ids
}

// The chain of categories from the top level down to (and including) the given one
export const categoryPath = (index, categoryID) => {
    const path = []
    let current = index.byID.get(categoryID)
    while (current) {
        path.unshift({ id: current.categoryID, name: current.categoryName })
        current = current.parentCategoryID == null ? null : index.byID.get(current.parentCategoryID)
    }
    return path
}

// Nested tree for the menus. `counts` maps categoryID -> number of products directly in that category.
// With `pruneEmpty` categories with no products anywhere beneath them are left out (the public menu).
export const buildTree = (index, counts, pruneEmpty) => {
    const build = parentID =>
        (index.childrenOf.get(parentID) || [])
            .map(row => {
                const subcategories = build(row.categoryID)
                const productCount =
                    (counts.get(row.categoryID) || 0) +
                    subcategories.reduce((total, sub) => total + sub.productCount, 0)
                return { id: row.categoryID, name: row.categoryName, productCount, subcategories }
            })
            .filter(node => !pruneEmpty || node.productCount > 0)
    return build(null)
}

//
// Queries
//

const loadCategories = async (conn = null) => {
    const [rows] = await (conn || db).query(
        'SELECT categoryID, parentCategoryID, categoryName FROM category',
    )
    return indexCategories(rows)
}

// Number of products directly in each category. Hidden products are only counted when asked for.
const loadProductCounts = async (includeHidden, conn = null) => {
    const [rows] = await (conn || db).query(
        `SELECT categoryID, COUNT(*) AS n FROM product ${includeHidden ? '' : 'WHERE productHidden = 0'} GROUP BY categoryID`,
    )
    return new Map(rows.map(row => [row.categoryID, Number(row.n)]))
}

// Loads everything the tree helpers need in one go
export const getCategoryIndex = async () => loadCategories()

// The category tree. The public menu only contains categories that have visible products beneath them,
// the admin one contains everything.
export const getCategoryTree = async ({ admin = false } = {}) => {
    try {
        const index = await loadCategories()
        const counts = await loadProductCounts(admin)
        return buildTree(index, counts, !admin)
    } catch (error) {
        console.error('Database error in getCategoryTree:', error)
        throw error
    }
}

// A single category with its path from the top level, or null when it does not exist
export const getCategory = async categoryID => {
    const index = await loadCategories()
    if (!index.byID.has(categoryID)) return null
    const path = categoryPath(index, categoryID)
    return { id: categoryID, name: path[path.length - 1].name, path }
}

// One featured product per top level category for the home page. A product in the top level category
// itself wins, otherwise the shallowest featured product beneath it is used.
export const getHomeCategories = async () => {
    try {
        const index = await loadCategories()
        const [products] = await db.query(
            `SELECT productID, categoryID, productImage0, productImage1, productImage2, productImage3
             FROM product WHERE productFeatured = 1 AND productHidden = 0 ORDER BY productID`,
        )

        const tiles = new Map()
        products.forEach(product => {
            const path = categoryPath(index, product.categoryID)
            if (!path.length) return
            const root = path[0]
            const current = tiles.get(root.id)
            if (!current || path.length < current.depth) {
                tiles.set(root.id, { ...product, categoryName: root.name, rootID: root.id, depth: path.length })
            }
        })

        return [...tiles.values()]
            .map(({ depth, rootID, categoryID, ...tile }) => ({ ...tile, categoryID: rootID }))
            .sort((a, b) => a.categoryName.localeCompare(b.categoryName, undefined, { numeric: true, sensitivity: 'base' }))
    } catch (error) {
        console.error('Database error in getHomeCategories:', error)
        throw error
    }
}

// Old links look like /products/<name>/<top level id>, the top level ids did not change in the migration so
// the category is either that top level category or a descendant of it with the given name.
export const resolveLegacyCategory = async (rootID, name) => {
    const index = await loadCategories()
    if (!index.byID.has(rootID)) return null
    const match = subtreeIDs(index, rootID)
        .map(id => index.byID.get(id))
        .find(category => sameName(category.categoryName, name))
    return match ? match.categoryID : null
}

//
// Changes
//

// Create a new category, at the top level when there is no parent
export const createCategory = async (categoryName, parentID) => {
    const index = await loadCategories()
    if (parentID != null && !index.byID.has(parentID)) {
        throw new CategoryError(404, `Parent category ${parentID} not found.`)
    }
    const siblings = index.childrenOf.get(parentID ?? null) || []
    if (siblings.some(sibling => sameName(sibling.categoryName, categoryName))) {
        throw new CategoryError(409, `There is already a category called "${categoryName}" here.`)
    }

    const [result] = await db.query(
        'INSERT INTO category (parentCategoryID, categoryName) VALUES (?, ?)',
        [parentID ?? null, categoryName],
    )
    return result.insertId
}

// Rename a category
export const renameCategory = async (categoryID, categoryName) => {
    const index = await loadCategories()
    const category = index.byID.get(categoryID)
    if (!category) throw new CategoryError(404, `Category ${categoryID} not found.`)

    const siblings = index.childrenOf.get(category.parentCategoryID ?? null) || []
    if (siblings.some(s => s.categoryID !== categoryID && sameName(s.categoryName, categoryName))) {
        throw new CategoryError(409, `There is already a category called "${categoryName}" here.`)
    }

    await db.query('UPDATE category SET categoryName = ? WHERE categoryID = ?', [categoryName, categoryID])
}

// Move a category, together with everything beneath it and all of its products, under a new parent
// (or to the top level when newParentID is null)
export const moveCategory = async (categoryID, newParentID) => {
    const index = await loadCategories()
    const category = index.byID.get(categoryID)
    if (!category) throw new CategoryError(404, `Category ${categoryID} not found.`)

    const parentID = newParentID ?? null
    if (parentID === (category.parentCategoryID ?? null)) return // already there

    if (parentID !== null) {
        if (!index.byID.has(parentID)) throw new CategoryError(404, `Category ${parentID} not found.`)
        if (subtreeIDs(index, categoryID).includes(parentID)) {
            throw new CategoryError(400, 'A category cannot be moved into itself or one of its own subcategories.')
        }
    }

    const siblings = index.childrenOf.get(parentID) || []
    if (siblings.some(s => sameName(s.categoryName, category.categoryName))) {
        throw new CategoryError(
            409,
            `The destination already has a category called "${category.categoryName}". Merge them instead of moving.`,
        )
    }

    await db.query('UPDATE category SET parentCategoryID = ? WHERE categoryID = ?', [parentID, categoryID])
}

// Merge one category into another: its products and subcategories end up in the target and the now empty
// source is removed. Subcategories that exist in both are merged recursively.
export const mergeCategory = async (sourceID, targetID) => {
    if (sourceID === targetID) throw new CategoryError(400, 'A category cannot be merged into itself.')

    const conn = await db.getConnection()
    try {
        await conn.beginTransaction()

        const index = await loadCategories(conn)
        if (!index.byID.has(sourceID)) throw new CategoryError(404, `Category ${sourceID} not found.`)
        if (!index.byID.has(targetID)) throw new CategoryError(404, `Category ${targetID} not found.`)
        if (subtreeIDs(index, sourceID).includes(targetID)) {
            throw new CategoryError(400, 'A category cannot be merged into one of its own subcategories.')
        }

        const stats = { products: 0, categories: 0 }

        const mergeInto = async (fromID, intoID) => {
            const targetChildren = [...(index.childrenOf.get(intoID) || [])]
            for (const child of index.childrenOf.get(fromID) || []) {
                const twin = targetChildren.find(t => sameName(t.categoryName, child.categoryName))
                if (twin) {
                    await mergeInto(child.categoryID, twin.categoryID)
                } else {
                    await conn.query('UPDATE category SET parentCategoryID = ? WHERE categoryID = ?', [intoID, child.categoryID])
                    stats.categories++
                }
            }

            // Only one product can represent a category on the home page
            const [[{ n: targetFeatured }]] = await conn.query(
                'SELECT COUNT(*) AS n FROM product WHERE categoryID = ? AND productFeatured = 1',
                [intoID],
            )
            if (Number(targetFeatured) > 0) {
                await conn.query('UPDATE product SET productFeatured = 0 WHERE categoryID = ?', [fromID])
            }

            const [moved] = await conn.query('UPDATE product SET categoryID = ? WHERE categoryID = ?', [intoID, fromID])
            stats.products += moved.affectedRows
            await conn.query('DELETE FROM category WHERE categoryID = ?', [fromID])
        }

        await mergeInto(sourceID, targetID)
        await conn.commit()
        return stats
    } catch (error) {
        await conn.rollback()
        throw error
    } finally {
        conn.release()
    }
}

// Delete a category and its subcategories. Refused while any product is still in there, move or merge those first.
export const deleteCategory = async categoryID => {
    const index = await loadCategories()
    if (!index.byID.has(categoryID)) throw new CategoryError(404, `Category ${categoryID} not found.`)

    const ids = subtreeIDs(index, categoryID)
    const [[{ n }]] = await db.query('SELECT COUNT(*) AS n FROM product WHERE categoryID IN (?)', [ids])
    if (Number(n) > 0) {
        throw new CategoryError(
            409,
            `This category still contains ${n} product${Number(n) === 1 ? '' : 's'}. Move or merge them into another category first.`,
        )
    }

    await db.query('DELETE FROM category WHERE categoryID = ?', [categoryID])
    return ids.length
}
