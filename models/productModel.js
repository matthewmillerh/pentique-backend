//import db connection
import db, { executeQuery } from '../config/database.js'

// Get all products for the specified top level category
export const getProductsByCategory = async categoryID => {
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
            p.productStockStatus,
            p.productImage0,
            p.productImage1,
            p.productImage2,
            p.productImage3,
            p.productFeatured,
            p.category1ID,
            p.category2ID,
            p.category3ID,
            c1.category1Name,
            c2.category2Name,
            c3.category3Name
        FROM product p
        LEFT OUTER JOIN category1 c1 ON c1.category1ID = p.category1ID 
        LEFT OUTER JOIN category2 c2 ON c2.category2ID = p.category2ID 
        LEFT OUTER JOIN category3 c3 ON c3.category3ID = p.category3ID 
        WHERE p.category1ID = ?
    `

    try {
        const results = await executeQuery(queryString, [categoryID])
        return results[0]
    } catch (error) {
        console.error('Database error in getProductsByCategory:', error)
        throw error
    }
}

// Get a single product by the specified ID
export const getProductById = async id => {
    const queryString = `
        SELECT product.*, category1.category1Name, category2.category2Name, category3.category3Name
        FROM product
        LEFT OUTER JOIN category1 ON category1.category1ID = product.category1ID
        LEFT OUTER JOIN category2 ON category2.category2ID = product.category2ID
        LEFT OUTER JOIN category3 ON category3.category3ID = product.category3ID
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
    const queryString = `
        UPDATE product 
        SET 
            productName = ?, 
            productDescription = ?, 
            productPrice = ?, 
            productCode = ?,
            productHidden = ?,
            productSpecial = ?,
            productSpecialPrice = ?,
            productStockStatus = ?,
            productImage0 = ?,
            productImage1 = ?,
            productImage2 = ?,
            productImage3 = ?
        WHERE productID = ?`

    try {
        const results = await executeQuery(queryString, [
            productData.productName,
            productData.productDescription,
            productData.productPrice,
            productData.productCode,
            productData.productHidden,
            productData.productSpecial,
            productData.productSpecialPrice,
            productData.productStockStatus,
            productData.productImage0,
            productData.productImage1,
            productData.productImage2,
            productData.productImage3,
            productData.productID,
        ])
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
