// Import functions from categoryModel
import {
    CategoryError,
    getCategoryTree,
    getHomeCategories,
    resolveLegacyCategory,
    renameCategory,
    createCategory,
    moveCategory,
    mergeCategory,
    deleteCategory,
} from '../models/categoryModel.js'

import { generateProductImageUrls } from '../utils/file.js'

// A positive whole number, or null when the value is missing / not valid
const toID = value => (Number.isInteger(value) && value > 0 ? value : null)

const validName = name => typeof name === 'string' && name.trim() !== ''

// Send an error back, using the status of expected (CategoryError) problems and a 500 for anything else
const sendError = (res, error, context) => {
    if (error instanceof CategoryError) {
        return res.status(error.status).json({ message: error.message })
    }
    console.error(`Error in ${context}:`, error)
    res.status(500).json({ message: `Failed to ${context} due to a server error.` })
}

// Get the category tree with the categories that have available products
export const getAllCategoriesController = async (req, res) => {
    try {
        res.json(await getCategoryTree())
    } catch (error) {
        sendError(res, error, 'fetch categories')
    }
}

// Get the whole category tree, including empty categories, for the admin view
export const getAllCategoriesAdminController = async (req, res) => {
    try {
        res.json(await getCategoryTree({ admin: true }))
    } catch (error) {
        sendError(res, error, 'fetch categories')
    }
}

// Get one featured product for each top level category (the home page tiles)
export const getHomeCategoriesController = async (req, res) => {
    try {
        const results = await getHomeCategories()

        results.forEach(product => {
            product.imageUrls = generateProductImageUrls(product, req)
        })

        res.json(results)
    } catch (error) {
        sendError(res, error, 'fetch categories')
    }
}

// Find the category an old /products/<name>/<top level id> link pointed to
export const resolveLegacyCategoryController = async (req, res) => {
    const rootID = toID(Number(req.query.rootID))
    const name = req.query.name

    if (!rootID || !validName(name)) {
        return res.status(400).json({ message: 'rootID and name are required.' })
    }

    try {
        const categoryID = await resolveLegacyCategory(rootID, name)
        if (!categoryID) return res.status(404).json({ message: 'Category not found.' })
        res.json({ categoryID })
    } catch (error) {
        sendError(res, error, 'find category')
    }
}

// Rename a product category
export const renameCategoryController = async (req, res) => {
    const { categoryName, categoryID } = req.body

    if (!validName(categoryName)) {
        return res
            .status(400)
            .json({ message: 'Category name is required and must be a non-empty string.' })
    }
    if (!toID(categoryID)) {
        return res
            .status(400)
            .json({ message: 'Category ID is required and must be a positive number.' })
    }

    try {
        await renameCategory(categoryID, categoryName.trim())
        res.status(200).json({
            message: 'Category renamed successfully!',
            categoryID,
            categoryName: categoryName.trim(),
        })
    } catch (error) {
        sendError(res, error, 'rename category')
    }
}

// Create a new product category, at the top level when no parent is given
export const createCategoryController = async (req, res) => {
    const { categoryName, parentID } = req.body

    if (!validName(categoryName)) {
        return res
            .status(400)
            .json({ message: 'Category name is required and must be a non-empty string.' })
    }
    if (parentID != null && !toID(parentID)) {
        return res
            .status(400)
            .json({ message: 'Parent category ID must be null (top level) or a positive number.' })
    }

    try {
        const id = await createCategory(categoryName.trim(), parentID ?? null)
        res.status(201).json({
            message: 'Category created successfully!',
            categoryName: categoryName.trim(),
            parentID: parentID ?? null,
            id,
        })
    } catch (error) {
        sendError(res, error, 'create category')
    }
}

// Move a category, with its subcategories and products, under a new parent (null = top level)
export const moveCategoryController = async (req, res) => {
    const { categoryID, newParentID } = req.body

    if (!toID(categoryID)) {
        return res
            .status(400)
            .json({ message: 'Category ID is required and must be a positive number.' })
    }
    if (newParentID != null && !toID(newParentID)) {
        return res
            .status(400)
            .json({ message: 'New parent ID must be null (top level) or a positive number.' })
    }

    try {
        await moveCategory(categoryID, newParentID ?? null)
        res.status(200).json({ message: 'Category moved successfully!', categoryID, newParentID: newParentID ?? null })
    } catch (error) {
        sendError(res, error, 'move category')
    }
}

// Merge a category into another one: products and subcategories move across, the source is removed
export const mergeCategoryController = async (req, res) => {
    const { sourceID, targetID } = req.body

    if (!toID(sourceID) || !toID(targetID)) {
        return res
            .status(400)
            .json({ message: 'Source and target category IDs are required and must be positive numbers.' })
    }

    try {
        const stats = await mergeCategory(sourceID, targetID)
        res.status(200).json({ message: 'Categories merged successfully!', sourceID, targetID, ...stats })
    } catch (error) {
        sendError(res, error, 'merge categories')
    }
}

// Delete a product category (only possible while it holds no products)
export const deleteCategoryController = async (req, res) => {
    const { categoryID } = req.body

    if (!toID(categoryID)) {
        return res
            .status(400)
            .json({ message: 'Category ID is required and must be a positive number.' })
    }

    try {
        const removed = await deleteCategory(categoryID)
        res.status(200).json({ message: 'Category deleted successfully!', categoryID, removed })
    } catch (error) {
        sendError(res, error, 'delete category')
    }
}
