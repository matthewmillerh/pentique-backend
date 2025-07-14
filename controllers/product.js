//import functions from Product model
import {
    getProductsByCategory,
    getProductById,
    updateProductById,
    deleteProductById,
} from '../models/productModel.js'
import {
    updateProductImages,
    deleteProductImages,
    generateProductImageUrls,
} from '../utils/file.js'

// Get products by category1ID
export const getProductsByCategoryController = async (req, res) => {
    try {
        const results = await getProductsByCategory(req.params.category1ID)
        results.forEach(product => {
            product.imageUrls = generateProductImageUrls(product, req)
        })
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
        const product = await getProductById(req.params.id)
        if (!product) {
            return res.status(404).json({ error: 'Product not found' })
        }

        product.imageUrls = generateProductImageUrls(product, req)

        res.json(product)
    } catch (error) {
        console.error('Error in getProductByIdController:', error)
        res.status(500).json({
            error: 'Failed to fetch products',
            message: error.message,
        })
    }
}

// Update a product by productID
export const updateProductByIdController = async (req, res) => {
    try {
        const productData = JSON.parse(req.body.productDetails)
        const images = [req.files.image_0, req.files.image_1, req.files.image_2, req.files.image_3]

        // Update product data first
        await updateProductById(productData)

        // Update product images if provided
        if (images && images.some(img => img)) {
            // Check if any images exist
            const imagesUpdated = await updateProductImages(images, productData.productID)
            if (!imagesUpdated) {
                console.error('Failed to update product images')
                return res.status(500).json({
                    error: 'Failed to update product images',
                })
            }
        }

        // Get the updated product data (including new image filenames)
        const updatedProduct = await getProductById(productData.productID)

        // Add image URLs to the updated product
        updatedProduct.imageUrls = generateProductImageUrls(updatedProduct, req)

        // Send the updated product data back to frontend
        res.json(updatedProduct)
    } catch (error) {
        console.error('Error in updateProductByIdController:', error)
        res.status(500).json({
            error: 'Failed to update product',
            message: error.message,
        })
    }
}

// Delete a product by productID
export const deleteProductByIdController = async (req, res) => {
    try {
        const productID = req.body.product.productID
        const result = await deleteProductById(productID)
        if (result) {
            res.json({ message: 'Product deleted successfully' })

            // Remove images associated with the product
            const categories = [
                req.body.product.category1Name,
                req.body.product.category2Name,
                req.body.product.category3Name,
            ]
            deleteProductImages(categories, productID)
        } else {
            res.status(404).json({ error: 'Product not found' })
        }
    } catch (error) {
        console.error('Error in deleteProductByIdController:', error)
        res.status(500).json({
            error: 'Failed to delete product',
            message: error.message,
        })
    }
}
