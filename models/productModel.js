//import db connection
import db, { executeQuery } from '../config/database.js'
import { getCategoryIndex, subtreeIDs } from './categoryModel.js'

// Helper function to ensure only one product represents a category as its featured product
const ensureOnlyOneFeaturedProduct = async (categoryID, excludeProductID = null) => {
    if (!categoryID) return // Skip if no categoryID

    const queryString = `
        UPDATE product 
        SET productFeatured = 0 
        WHERE categoryID = ? ${excludeProductID ? 'AND productID != ?' : ''}
    `

    const params = excludeProductID ? [categoryID, excludeProductID] : [categoryID]

    try {
        await executeQuery(queryString, params)
        console.log(
            `Set all products in category ${categoryID} to not featured${excludeProductID ? ` (excluding product ${excludeProductID})` : ''}`,
        )
    } catch (error) {
        console.error('Error ensuring only one featured product:', error)
        throw error
    }
}

// Get all products in any of the specified categories (a category and everything beneath it)
export const getProductsByCategory = async categoryIDs => {
    const queryString = `
        SELECT 
            p.productID,
            p.productName,
            p.productDescription,
            p.productPrice,
            p.productCode,
            p.productHidden,
            p.productSpecial,
            p.productSpecialPrice,
            p.productStock,
            p.productImage0,
            p.productImage1,
            p.productImage2,
            p.productImage3,
            p.productFeatured,
            p.categoryID,
            c.categoryName
        FROM product p
        INNER JOIN category c ON c.categoryID = p.categoryID
        WHERE p.categoryID IN (?)
        ORDER BY p.productName ASC
    `

    try {
        const results = await executeQuery(queryString, [categoryIDs])
        return results[0]
    } catch (error) {
        console.error('Database error in getProductsByCategory:', error)
        throw error
    }
}

// Visible products shown in the last 7 days (productShownAt is set whenever a product goes from hidden to shown,
// see updateProductById/updateProducts/addProduct), newest first. `limit` caps how many come back, for the home
// page's row; the dedicated New Arrivals page calls this with no limit.
export const getNewArrivals = async (limit = null) => {
    const queryString = `
        SELECT
            p.productID,
            p.productName,
            p.productDescription,
            p.productPrice,
            p.productCode,
            p.productHidden,
            p.productShownAt,
            p.productSpecial,
            p.productSpecialPrice,
            p.productStock,
            p.productImage0,
            p.productImage1,
            p.productImage2,
            p.productImage3,
            p.productFeatured,
            p.categoryID,
            c.categoryName
        FROM product p
        INNER JOIN category c ON c.categoryID = p.categoryID
        WHERE p.productHidden = 0
          AND p.productShownAt >= NOW() - INTERVAL 7 DAY
        ORDER BY p.productShownAt DESC, p.productID DESC
        ${Number.isInteger(limit) ? 'LIMIT ?' : ''}
    `

    try {
        const [rows] = await executeQuery(queryString, Number.isInteger(limit) ? [limit] : [])
        return rows
    } catch (error) {
        console.error('Database error in getNewArrivals:', error)
        throw error
    }
}

// Get a single product by the specified ID
export const getProductById = async id => {
    const queryString = `
        SELECT product.*, category.categoryName
        FROM product
        INNER JOIN category ON category.categoryID = product.categoryID
        WHERE productID = ?`

    try {
        const results = await executeQuery(queryString, [id])
        return results[0][0]
    } catch (error) {
        console.error('Database error in getProductById:', error)
        throw error
    }
}

// Update a product by the specified ID
export const updateProductById = async productData => {
    // If setting this product as featured, remove featured status from other products in same category
    if (productData.productFeatured == 1 && productData.categoryID) {
        await ensureOnlyOneFeaturedProduct(productData.categoryID, productData.productID)
    }

    const queryString = `
        UPDATE product
        SET
            productName = ?,
            productDescription = ?,
            productPrice = ?,
            productCode = ?,
            -- read here before productHidden below overwrites it, so this sees the row's old value
            productShownAt = CASE WHEN productHidden = 1 AND ? = 0 THEN NOW() ELSE productShownAt END,
            productHidden = ?,
            productSpecial = ?,
            productSpecialPrice = ?,
            productStock = ?,
            productImage0 = ?,
            productImage1 = ?,
            productImage2 = ?,
            productImage3 = ?,
            productFeatured = ?,
            categoryID = ?
        WHERE productID = ?`

    try {
        const results = await executeQuery(queryString, [
            productData.productName,
            productData.productDescription,
            productData.productPrice,
            productData.productCode,
            productData.productHidden, // for the CASE check above
            productData.productHidden,
            productData.productSpecial,
            productData.productSpecialPrice,
            productData.productStock,
            productData.productImage0,
            productData.productImage1,
            productData.productImage2,
            productData.productImage3,
            productData.productFeatured || 0,
            productData.categoryID,
            productData.productID,
        ])
        console.log(results[0])
        return results[0]
    } catch (error) {
        console.error('Database error in updateProductById:', error)
        throw error
    }
}

// Delete a product by the specified ID
export const deleteProductById = async id => {
    const queryString = 'DELETE FROM product WHERE productID = ?'

    try {
        const results = await executeQuery(queryString, [id])
        return results[0]
    } catch (error) {
        console.error('Database error in deleteProductById:', error)
        throw error
    }
}

// Adds a new product to the database
export const addProduct = async productData => {
    const queryString = `
        INSERT INTO product (
            productName, 
            productDescription, 
            productPrice, 
            productCode,
            productHidden,
            productShownAt,
            productSpecial,
            productSpecialPrice,
            productStock,
            productImage0,
            productImage1,
            productImage2,
            productImage3,
            productFileName,
            categoryID,
            productFeatured
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `

    // If setting this product as featured, remove featured status from other products in same category
    if (productData.productFeatured == 1 && productData.categoryID) {
        await ensureOnlyOneFeaturedProduct(productData.categoryID)
    }

    try {
        const results = await executeQuery(queryString, [
            productData.productName,
            productData.productDescription,
            productData.productPrice,
            productData.productCode,
            productData.productHidden,
            productData.productHidden ? null : new Date(), // shown from the start, unless added hidden
            productData.productSpecial,
            productData.productSpecialPrice,
            productData.productStock,
            productData.productImage0,
            productData.productImage1,
            productData.productImage2,
            productData.productImage3,
            productData.productFileName || '',
            productData.categoryID,
            productData.productFeatured || 0,
        ])
        return results[0]
    } catch (error) {
        console.error('Database error in addProduct:', error)
        throw error
    }
}

// Move several products into one category. Only one product may represent a category as its featured product,
// so a moved product loses its featured flag when the destination already has one (or another moved product has it).
// Returns the number of products moved.
export const moveProducts = async (productIDs, categoryID) => {
    const conn = await db.getConnection()
    try {
        await conn.beginTransaction()

        const [[{ n: destinationFeatured }]] = await conn.query(
            'SELECT COUNT(*) AS n FROM product WHERE categoryID = ? AND productFeatured = 1 AND productID NOT IN (?)',
            [categoryID, productIDs],
        )
        const [featured] = await conn.query(
            'SELECT productID FROM product WHERE productID IN (?) AND productFeatured = 1 ORDER BY productID',
            [productIDs],
        )
        const keepFeatured = Number(destinationFeatured) === 0 && featured.length ? featured[0].productID : null
        const unfeature = featured.map(p => p.productID).filter(id => id !== keepFeatured)
        if (unfeature.length) {
            await conn.query('UPDATE product SET productFeatured = 0 WHERE productID IN (?)', [unfeature])
        }

        const [result] = await conn.query('UPDATE product SET categoryID = ? WHERE productID IN (?)', [
            categoryID,
            productIDs,
        ])

        await conn.commit()
        return result.affectedRows
    } catch (error) {
        await conn.rollback()
        console.error('Database error in moveProducts:', error)
        throw error
    } finally {
        conn.release()
    }
}

// Fields that can be changed on several products at once, with the column each maps to
const BULK_UPDATABLE = ['productHidden', 'productStock']

// Apply the same changes (e.g. { productHidden: 1 } or { productStock: 0 }) to several products.
// Returns the number of products found.
export const updateProducts = async (productIDs, changes) => {
    const fields = Object.keys(changes).filter(field => BULK_UPDATABLE.includes(field))
    if (!fields.length) throw new Error('No updatable fields given')

    // becoming visible sets productShownAt to now. This has to run before productHidden itself is overwritten
    // below, so the `productHidden` it reads here is still the row's old value.
    const setClauses = []
    if (fields.includes('productHidden') && Number(changes.productHidden) === 0) {
        setClauses.push('productShownAt = CASE WHEN productHidden = 1 THEN NOW() ELSE productShownAt END')
    }
    setClauses.push(...fields.map(field => `${field} = ?`))

    try {
        const [result] = await executeQuery(
            `UPDATE product SET ${setClauses.join(', ')} WHERE productID IN (?)`,
            [...fields.map(field => changes[field]), productIDs],
        )
        return result.affectedRows
    } catch (error) {
        console.error('Database error in updateProducts:', error)
        throw error
    }
}

// Delete several products at once. Returns the ids that were actually deleted, so their images can be removed.
export const deleteProducts = async productIDs => {
    const conn = await db.getConnection()
    try {
        await conn.beginTransaction()
        const [rows] = await conn.query('SELECT productID FROM product WHERE productID IN (?)', [productIDs])
        const existing = rows.map(row => row.productID)
        if (existing.length) {
            await conn.query('DELETE FROM product WHERE productID IN (?)', [existing])
        }
        await conn.commit()
        return existing
    } catch (error) {
        await conn.rollback()
        console.error('Database error in deleteProducts:', error)
        throw error
    } finally {
        conn.release()
    }
}

// Search the visible products: every word has to appear in the name, the description (ignoring the HTML in
// descriptions) or the name of the product's category or one of the categories above it, e.g. "hot wheels" finds the
// products in "Hot Wheels - Silver Series". Products with the whole search in their name come first, then those in a
// category named after the whole search. Returns every match.
export const searchProducts = async (words, phrase) => {
    // Treat % _ and \ as normal characters instead of LIKE wildcards
    const like = text => `%${text.replace(/[\\%_]/g, char => `\\${char}`)}%`
    const description = "REGEXP_REPLACE(IFNULL(p.productDescription, ''), '<[^>]*>', ' ')"

    // The categories whose own name or a parent's name contains the text
    const index = await getCategoryIndex()
    const categoriesMatching = text => {
        const ids = new Set()
        index.byID.forEach(category => {
            if (category.categoryName.toLowerCase().includes(text.toLowerCase())) {
                subtreeIDs(index, category.categoryID).forEach(id => ids.add(id))
            }
        })
        return [...ids]
    }
    const categoryIDsPerWord = words.map(categoriesMatching)
    // Products in a category named after the whole search come right after the name matches, e.g. for "gift bags" the
    // gift bags come before stickers that are "great for decorating gift bags". 0 is no category, IN () is not valid.
    const phraseCategoryIDs = categoriesMatching(phrase)
    if (!phraseCategoryIDs.length) phraseCategoryIDs.push(0)
    const wordCondition = i =>
        `AND (p.productName LIKE ? OR ${description} LIKE ?${categoryIDsPerWord[i].length ? ' OR p.categoryID IN (?)' : ''})`

    const queryString = `
        SELECT 
            p.productID,
            p.productName,
            p.productPrice,
            p.productCode,
            p.productSpecial,
            p.productSpecialPrice,
            p.productStock,
            p.productImage0,
            p.productImage1,
            p.productImage2,
            p.productImage3,
            p.categoryID,
            c.categoryName
        FROM product p
        INNER JOIN category c ON c.categoryID = p.categoryID
        WHERE p.productHidden = 0
            ${words.map((word, i) => wordCondition(i)).join('\n            ')}
        ORDER BY (p.productName LIKE ?) DESC, (p.categoryID IN (?)) DESC, p.productName ASC
    `

    try {
        const results = await executeQuery(queryString, [
            ...words.flatMap((word, i) =>
                categoryIDsPerWord[i].length
                    ? [like(word), like(word), categoryIDsPerWord[i]]
                    : [like(word), like(word)],
            ),
            like(phrase),
            phraseCategoryIDs,
        ])
        return results[0]
    } catch (error) {
        console.error('Database error in searchProducts:', error)
        throw error
    }
}

// Every product, hidden ones included, with what the catalogue export needs
export const getAllProductsForExport = async () => {
    try {
        const [rows] = await executeQuery(`
            SELECT
                productID,
                productName,
                productCode,
                productPrice,
                productSpecial,
                productSpecialPrice,
                productStock,
                productHidden,
                productFeatured,
                productDescription,
                productImage0,
                productImage1,
                productImage2,
                productImage3,
                categoryID
            FROM product
        `)
        return rows
    } catch (error) {
        console.error('Database error in getAllProductsForExport:', error)
        throw error
    }
}

// The products of an order as they are right now (name, prices, stock), for the order emails
export const getProductsForOrder = async productIDs => {
    try {
        const [rows] = await executeQuery(
            `SELECT productID, productName, productCode, productPrice, productSpecial, productSpecialPrice,
                    productStock, productHidden
             FROM product
             WHERE productID IN (?)`,
            [productIDs]
        )
        return rows
    } catch (error) {
        console.error('Database error in getProductsForOrder:', error)
        throw error
    }
}
