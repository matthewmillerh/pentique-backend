import express from 'express'

//import product functions from controller
import {
    getProductsByCategoryController,
    getProductByIdController,
    updateProductByIdController,
    deleteProductByIdController,
    addProductController,
    moveProductsController,
    bulkUpdateProductsController,
    bulkDeleteProductsController,
    searchProductsController,
} from '../controllers/product.js'

//import category functions
import {
    getHomeCategoriesController,
    getAllCategoriesController,
    renameCategoryController,
    createCategoryController,
    moveCategoryController,
    mergeCategoryController,
    deleteCategoryController,
    getAllCategoriesAdminController,
    resolveLegacyCategoryController,
} from '../controllers/category.js'

//import the catalogue export
import { exportCatalogueController } from '../controllers/export.js'
//import the catalogue stats
import { catalogueStatsController } from '../controllers/stats.js'

//import the order and contact form emails
import { placeOrderController, sendContactController } from '../controllers/orders.js'
import { rateLimit } from '../utils/rateLimit.js'

//import authorization functions
import { login, authenticateToken } from '../controllers/authorization.js'
import multer from 'multer'

//init express router
const router = express.Router()

// The forms anyone can send (checkout, contact). A visitor can send a handful every quarter of an hour.
const orderLimit = rateLimit({
    max: 15,
    windowMs: 15 * 60 * 1000,
    message: 'You have placed a lot of orders in a short time. Please wait a few minutes and try again.',
})
const contactLimit = rateLimit({
    max: 5,
    windowMs: 15 * 60 * 1000,
    message: 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.',
})

// Place an order (emails the shop and the customer)
router.post('/orders', orderLimit, placeOrderController)

// Send the contact form (emails the shop)
router.post('/contact', contactLimit, sendContactController)

//get the products in a category and all of its subcategories
router.get('/products-by-category/:categoryID', getProductsByCategoryController)

//search the store (before /products/:id, which would otherwise take "search" as an id)
router.get('/products/search', searchProductsController)

//get a single product by id
router.get('/products/:id', getProductByIdController)

// get the category tree (only categories that have products)
router.get('/get-all-categories', getAllCategoriesController)

//get one featured product for each top level category (home page)
router.get('/home-categories', getHomeCategoriesController)

//find the category an old /products/<name>/<top level id> link pointed to
router.get('/categories/legacy', resolveLegacyCategoryController)

// validate user login
router.post('/login', login)

//
// Protected routes
//
// Get all categories for admin view
router.get('/admin/get-all-categories', authenticateToken, getAllCategoriesAdminController)

// Download the whole product catalogue as an Excel workbook
router.get('/admin/export/catalogue', authenticateToken, exportCatalogueController)

// Figures about the catalogue for the admin Stats page
router.get('/admin/stats', authenticateToken, catalogueStatsController)
// Rename a product category
router.put('/categories/rename', authenticateToken, renameCategoryController)

// Create a new category
router.post('/categories/create', authenticateToken, createCategoryController)

// Move a category (with its subcategories and products) to a new parent
router.put('/categories/move', authenticateToken, moveCategoryController)

// Merge a category into another one
router.put('/categories/merge', authenticateToken, mergeCategoryController)

// Delete a category
router.delete('/categories/delete', authenticateToken, deleteCategoryController)

// Update a product by productID
// Configure multer for file uploads (store in memory or specify disk storage as needed)
const upload = multer({ storage: multer.memoryStorage() })

router.put(
    '/products/edit',
    authenticateToken,
    upload.fields([
        { name: 'productDetails', maxCount: 1 },
        { name: 'image_0', maxCount: 1 },
        { name: 'image_1', maxCount: 1 },
        { name: 'image_2', maxCount: 1 },
        { name: 'image_3', maxCount: 1 },
    ]),
    updateProductByIdController,
)

// Delete a product by productID
router.delete('/products/delete', authenticateToken, deleteProductByIdController)

// Move several products to another category
router.put('/products/move', authenticateToken, moveProductsController)

// Hide / show several products, or set their stock
router.put('/products/bulk-update', authenticateToken, bulkUpdateProductsController)

// Delete several products
router.delete('/products/bulk-delete', authenticateToken, bulkDeleteProductsController)

// Add a new product
router.post(
    '/products/add',
    authenticateToken,
    upload.fields([
        { name: 'productDetails', maxCount: 1 },
        { name: 'image_0', maxCount: 1 },
        { name: 'image_1', maxCount: 1 },
        { name: 'image_2', maxCount: 1 },
        { name: 'image_3', maxCount: 1 },
    ]),
    addProductController,
)

//export default router
export default router
