import express from 'express'

//import product functions from controller
import {
    getProductsByCategoryController,
    getProductByIdController,
    updateProductByIdController,
    deleteProductByIdController,
    addProductController,
} from '../controllers/product.js'

//import category functions
import {
    getCategory1Controller,
    getAllCategoriesController,
    renameCategoryController,
    createCategoryController,
    deleteCategoryController,
    getAllCategoriesAdminController,
} from '../controllers/category.js'

//import authorization functions
import { login, authenticateToken } from '../controllers/authorization.js'
import multer from 'multer'

//init express router
const router = express.Router()

//get products buy category1ID
router.get('/products-by-category/:category1ID', getProductsByCategoryController)

//get a single product by id
router.get('/products/:id', getProductByIdController)

// get a list of all the categories and their subcategories
router.get('/get-all-categories', getAllCategoriesController)

//get all category 1 items
router.get('/category1', getCategory1Controller)

// validate user login
router.post('/login', login)

//
// Protected routes
//
// Get all categories for admin view
router.get('/admin/get-all-categories', authenticateToken, getAllCategoriesAdminController)
// Rename a product category
router.put('/categories/rename', authenticateToken, renameCategoryController)

// Create a new category
router.post('/categories/create', authenticateToken, createCategoryController)

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
