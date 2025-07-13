// Import functions from categoryModel
import {
    getCategory1,
    getAllCategories,
    renameCategory,
    createCategory,
    deleteCategory,
} from '../models/categoryModel.js'

import {
    createCategoryDirectory,
    deleteCategoryDirectory,
    generateProductImageUrls,
} from '../utils/file.js'

// Get all the categories
export const getAllCategoriesController = async (req, res) => {
    try {
        const results = await getAllCategories()
        res.json(transformCategories(results)) //restructure the data before returning
    } catch (error) {
        console.error('Error in getAllCategoriesController:', error)
        res.status(500).json({
            error: 'Failed to fetch categories',
            message: error.message,
        })
    }
}

// Get all level 1 categories
export const getCategory1Controller = async (req, res) => {
    try {
        const results = await getCategory1()

        results.forEach(product => {
            product.imageUrls = generateProductImageUrls(product, req)
        })

        res.json(results)
    } catch (error) {
        console.error('Error in getCategory1Controller:', error)
        res.status(500).json({
            error: 'Failed to fetch categories',
            message: error.message,
        })
    }
}

// Rename a product category
export const renameCategoryController = async (req, res) => {
    const { categoryName, categoryID, categoryLevel } = req.body

    // Ensure all required fields are present and valid types
    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
        return res
            .status(400)
            .json({ message: 'Category name is required and must be a non-empty string.' })
    }
    if (!categoryID || typeof categoryID !== 'number' || categoryID <= 0) {
        return res
            .status(400)
            .json({ message: 'Category ID is required and must be a positive number.' })
    }
    if (!categoryLevel || typeof categoryLevel !== 'number' || ![1, 2, 3].includes(categoryLevel)) {
        return res
            .status(400)
            .json({ message: 'Category level is required and must be 1, 2, or 3.' })
    }

    try {
        // Execute the renameCategory function from the model
        const result = await renameCategory(categoryName.trim(), categoryID, categoryLevel)

        if (result && result.affectedRows > 0) {
            res.status(200).json({
                message: 'Category renamed successfully!',
                categoryID,
                categoryName,
            })
        } else {
            res.status(404).json({
                message: `Category with ID ${categoryID} at level ${categoryLevel} not found or no change was needed.`,
            })
        }
    } catch (error) {
        console.error('Error in renameCategoryControllerr:', error)
        res.status(500).json({ message: 'Failed to rename category due to a server error.' })
    }
}

// Create a new product category
export const createCategoryController = async (req, res) => {
    const { categoryName, categoryLevel, parentId, categoryPath } = req.body

    // Ensure all required fields are present and valid types
    if (!categoryName || typeof categoryName !== 'string' || categoryName.trim() === '') {
        return res
            .status(400)
            .json({ message: 'Category name is required and must be a non-empty string.' })
    }
    if (
        (categoryLevel === 1 && parentId != null && parentId !== undefined) ||
        (categoryLevel !== 1 && (typeof parentId !== 'number' || parentId <= 0))
    ) {
        return res.status(400).json({
            message:
                'Parent category ID must be null or undefined for level 1, and a positive number for level 2 or 3.',
        })
    }
    if (!categoryLevel || typeof categoryLevel !== 'number' || ![1, 2, 3].includes(categoryLevel)) {
        return res
            .status(400)
            .json({ message: 'Category level is required and must be 1, 2, or 3.' })
    }

    try {
        // Execute the createCategory function from the model
        const result = await createCategory(categoryName.trim(), parentId, categoryLevel)

        if (result && result.affectedRows > 0) {
            // If the category is created successfully, also create its directory
            if (createCategoryDirectory(categoryPath)) {
                res.status(201).json({
                    message: 'Category created successfully!',
                    categoryName,
                    parentId,
                    categoryLevel,
                    id: result.insertId,
                })
            } else {
                res.status(500).json({
                    message: 'Failed to create category directory.',
                })
            }
        } else {
            res.status(400).json({
                message: 'Failed to create category. Please check the provided details.',
            })
        }
    } catch (error) {
        console.error('Error in createCategoryController:', error)
        res.status(500).json({
            error: 'Failed to create category',
            message: error.message,
        })
    }
}

// Delete a product category
export const deleteCategoryController = async (req, res) => {
    const { categoryLevel, categoryID, categoryPath } = req.body

    // Ensure all required fields are present and valid types
    if (!categoryID || typeof categoryID !== 'number' || categoryID <= 0) {
        return res
            .status(400)
            .json({ message: 'Category ID is required and must be a positive number.' })
    }
    if (!categoryLevel || typeof categoryLevel !== 'number' || ![1, 2, 3].includes(categoryLevel)) {
        return res
            .status(400)
            .json({ message: 'Category level is required and must be 1, 2, or 3.' })
    }

    try {
        // Execute the deleteCategory function from the model
        const result = await deleteCategory(categoryLevel, categoryID, categoryPath)

        if (result && result.affectedRows > 0) {
            // If the category is deleted successfully, also delete its directory
            if (deleteCategoryDirectory(categoryPath)) {
                res.status(200).json({
                    message: 'Category deleted successfully!',
                    categoryID,
                    categoryLevel,
                })
            }
        } else {
            res.status(404).json({
                message: `Category with ID ${categoryID} at level ${categoryLevel} not found.`,
            })
        }
    } catch (error) {
        console.error('Error in deleteCategoryController:', error)
        res.status(500).json({ message: 'Failed to delete category due to a server error.' })
    }
}

// Restructure the category data to have nested subcategories
function transformCategories(data) {
    const finalNavigation = []
    // Maps to keep track of created category objects by their unique identifiers
    const topLevelMap = new Map() // Key: category1ID, Value: category object {id, name, subcategories}
    const level2Map = new Map() // Key: category2ID, Value: category object {id, name, subcategories}

    data.forEach(row => {
        // --- Process Top Level Category ---
        if (!topLevelMap.has(row.category1ID)) {
            const topCategory = {
                id: row.category1ID,
                name: row.category1Name,
                subcategories: [],
            }
            finalNavigation.push(topCategory)
            topLevelMap.set(row.category1ID, topCategory)
        }
        const currentTopCategory = topLevelMap.get(row.category1ID)

        // --- Process Level 2 Category ---
        if (row.category2Name !== null) {
            const level2Key = row.category2ID

            if (!level2Map.has(level2Key)) {
                const level2Category = {
                    name: row.category2Name,
                    id: row.category2ID,
                    subcategories: [],
                }
                currentTopCategory.subcategories.push(level2Category)
                level2Map.set(level2Key, level2Category)
            }
            const currentLevel2Category = level2Map.get(level2Key)

            // --- Process Level 3 Category ---
            if (row.category3Name !== null) {
                // Check if this level 3 category already exists under the current level 2.
                const existingLevel3 = currentLevel2Category.subcategories.find(
                    sub => sub.id === row.category3ID,
                )

                if (!existingLevel3) {
                    const level3Category = {
                        name: row.category3Name,
                        id: row.category3ID,
                    }
                    currentLevel2Category.subcategories.push(level3Category)
                }
            }
        }
    })
    return finalNavigation
}
