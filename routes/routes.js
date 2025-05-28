import express from 'express'

//import product functions from controller
import {
    getProductsByCategoryController,
    getProductByIdController,
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

//export default router
export default router
