import express from 'express'

//import product functions from controller
import {
    getProductsByCategoryController,
    getProductByIdController,
    updateProductByIdController,
    deleteProductByIdController,
} from '../controllers/product.js'

//import category functions
import {
    getCategory1Controller,
    getAllCategoriesController,
    renameCategoryController,
    createCategoryController,
    deleteCategoryController,
} from '../controllers/category.js'

//import authorization functions
import { login } from '../controllers/authorization.js'
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

// Rename a product category
router.put('/categories/rename', renameCategoryController)

// Create a new category
router.post('/categories/create', createCategoryController)

// Delete a category
router.delete('/categories/delete', deleteCategoryController)

// Update a product by productID
// Configure multer for file uploads (store in memory or specify disk storage as needed)
const upload = multer({ storage: multer.memoryStorage() })

router.put(
    '/products/edit',
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
router.delete('/products/delete', deleteProductByIdController)

//export default router
export default router
