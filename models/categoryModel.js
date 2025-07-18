//import db connection
import db, { executeQuery } from '../config/database.js'

// Gets all categories that have available products
export const getAllCategories = async () => {
    const queryString = `
        SELECT DISTINCT
            c1.category1Name, 
            c2.category2Name, 
            c3.category3Name, 
            c1.category1ID, 
            c2.category2ID, 
            c3.category3ID
        FROM 
            category1 c1
        LEFT JOIN 
            category2 c2 ON c2.category1ID = c1.category1ID
        LEFT JOIN 
            category3 c3 ON c3.category2ID = c2.category2ID
        INNER JOIN 
            product p ON (
                p.category1ID = c1.category1ID OR 
                p.category2ID = c2.category2ID OR 
                p.category3ID = c3.category3ID
            )
        WHERE 
            p.productHidden = 0
        ORDER BY 
            c1.category1Name ASC, c2.category2Name ASC, c3.category3Name ASC
    `
    try {
        const results = await executeQuery(queryString)
        return results[0]
    } catch (error) {
        console.error('Database error in getProductsByCategory:', error)
        throw error
    }
}

// Gets all categories and subcategories for admin view
export const getAllCategoriesAdmin = async () => {
    const queryString = `
        SELECT 
            c1.category1Name, 
            c2.category2Name, 
            c3.category3Name, 
            c1.category1ID, 
            c2.category2ID, 
            c3.category3ID
        FROM 
            category1 c1
        LEFT JOIN 
            category2 c2 ON c2.category1ID = c1.category1ID
        LEFT JOIN 
            category3 c3 ON c3.category2ID = c2.category2ID
        ORDER BY 
            c1.category1Name ASC, c2.category2Name ASC, c3.category3Name ASC
    `
    try {
        const results = await executeQuery(queryString)
        return results[0]
    } catch (error) {
        console.error('Database error in getProductsByCategory:', error)
        throw error
    }
}

// Get all top level categories
export const getCategory1 = async () => {
    const queryString = `
        SELECT product.productImage0, product.productImage1, product.productImage2, product.productImage3, product.productID, category1.category1Name, category2.category2Name, category3.category3Name, category1.category1ID 
        FROM product
        LEFT OUTER JOIN category1 ON category1.category1ID = product.category1ID 
        LEFT OUTER JOIN category2 ON category2.category2ID = product.category2ID 
        LEFT OUTER JOIN category3 ON category3.category3ID = product.category3ID
        WHERE product.productFeatured=1 AND product.productHidden=0
        ORDER BY category1.category1Name ASC, category2.category2Name ASC, category3.category3Name ASC
    `
    try {
        const results = await executeQuery(queryString)
        return results[0]
    } catch (error) {
        console.error('Database error in getCategory1:', error)
        throw error
    }
}

// Rename a product category
export const renameCategory = async (categoryName, categoryID, categoryLevel) => {
    let queryString = ''

    // Determine which category level to update
    switch (categoryLevel) {
        case 1:
            queryString = `UPDATE category1 SET category1Name = ? WHERE category1ID = ?`
            break
        case 2:
            queryString = `UPDATE category2 SET category2Name = ? WHERE category2ID = ?`
            break
        case 3:
            queryString = `UPDATE category3 SET category3Name = ? WHERE category3ID = ?`
            break
        default:
            throw new Error('Invalid category level')
    }

    try {
        const results = await executeQuery(queryString, [categoryName, categoryID])
        return results[0]
    } catch (error) {
        console.error('Database error in renameCategory:', error)
        throw error
    }
}

// Create a new category
export const createCategory = async (categoryName, parentID, categoryLevel) => {
    let queryString = ''

    // Determine which category table to insert into
    switch (categoryLevel) {
        case 1:
            queryString = `INSERT INTO category1 (category1Name) VALUES (?)`
            break
        case 2:
            queryString = `INSERT INTO category2 (category2Name, category1ID) VALUES (?, ?)`
            break
        case 3:
            queryString = `INSERT INTO category3 (category3Name, category2ID) VALUES (?, ?)`
            break
        default:
            throw new Error('Invalid category level')
    }

    try {
        const results = await executeQuery(queryString, [categoryName, parentID])
        return results[0]
    } catch (error) {
        console.error('Database error in createCategory:', error)
        throw error
    }
}

// Delete a category
export const deleteCategory = async (categoryLevel, categoryID) => {
    let queryString = ''

    // Determine which category table to delete from
    switch (categoryLevel) {
        case 1:
            queryString = `DELETE FROM category1 WHERE category1ID = ?`
            break
        case 2:
            queryString = `DELETE FROM category2 WHERE category2ID = ?`
            break
        case 3:
            queryString = `DELETE FROM category3 WHERE category3ID = ?`
            break
        default:
            throw new Error('Invalid category level')
    }

    try {
        const results = await executeQuery(queryString, [categoryID])
        return results[0]
    } catch (error) {
        console.error('Database error in deleteCategory:', error)
        throw error
    }
}
