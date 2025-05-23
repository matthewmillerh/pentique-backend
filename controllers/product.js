//import functions from Product model
import { getProductsByCategory, getProductById } from '../models/productModel.js'

// Get products by category1ID
export const getProductsByCategoryController = async (req, res) => {
    try {
        const results = await getProductsByCategory(req.params.category1ID)
        res.json(results)
    } catch (error) {
        console.error('Error in getProductsByCategoryController:', error)
        res.status(500).json({
            error: 'Failed to fetch products',
            message: error.message,
        })
    }
}

// Get a single product by productID
export const getProductByIdController = async (req, res) => {
    try {
        const results = await getProductById(req.params.id)
        res.json(results)
    } catch (error) {
        console.error('Error in getProductByIdController:', error)
        res.status(500).json({
            error: 'Failed to fetch products',
            message: error.message,
        })
    }
}
