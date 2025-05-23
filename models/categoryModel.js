//import db connection
import db from '../config/database.js'

// Get all categories and subcategories
export const getAllCategories = async () => {
    const queryString = `
        SELECT category1.category1Name, category2.category2Name, category3.category3Name, category1.category1ID 
        FROM product 
        LEFT JOIN category1 ON category1.category1ID = product.category1ID 
        LEFT JOIN category2 ON category2.category2ID = product.category2ID 
        LEFT JOIN category3 ON category3.category3ID = product.category3ID
        GROUP BY category1.category1ID, category2.category2ID, category3.category3ID
    `
    try {
        const results = await db.query(queryString)
        return results[0]
    } catch (error) {
        console.error('Database error in getProductsByCategory:', error)
        throw error
    }
}

//get all top level categories
export const getCategory1 = async () => {
    const queryString = `
        SELECT product.productFileName, category1.category1Name, category2.category2Name, category3.category3Name, category1.category1ID 
        FROM product
        LEFT OUTER JOIN category1 ON category1.category1ID = product.category1ID 
        LEFT OUTER JOIN category2 ON category2.category2ID = product.category2ID 
        LEFT OUTER JOIN category3 ON category3.category3ID = product.category3ID
        WHERE product.productFeatured=1
    `
    try {
        const results = await db.query(queryString)
        return results[0]
    } catch (error) {
        console.error('Database error in getCategory1:', error)
        throw error
    }
}
