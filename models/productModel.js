//import db connection
import db from '../config/database.js'

// Get all products for the specified top level category
export const getProductsByCategory = async categoryID => {
    const queryString = `
        SELECT 
            product.*,
            category1.*,
            category2.*, 
            category3.*
        FROM product 
        LEFT OUTER JOIN category1 ON category1.category1ID = product.category1ID 
        LEFT OUTER JOIN category2 ON category2.category2ID = product.category2ID 
        LEFT OUTER JOIN category3 ON category3.category3ID = product.category3ID 
        WHERE product.category1ID = ?
    `

    try {
        const results = await db.query(queryString, [categoryID])
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
        const results = await db.query(queryString, [id])
        return results[0][0]
    } catch (error) {
        console.error('Database error in getProductById:', error)
        throw error
    }
}
