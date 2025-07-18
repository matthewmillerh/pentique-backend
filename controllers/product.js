//import functions from Product model
import {
    getProductsByCategory,
    getProductById,
    updateProductById,
    deleteProductById,
    addProduct,
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

        // Handle category IDs - set to null if not provided or empty
        productData.category2ID = productData.category2ID || null
        productData.category3ID = productData.category3ID || null

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
            deleteProductImages(productID)
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

// Add a new product
export const addProductController = async (req, res) => {
    try {
        const productData = JSON.parse(req.body.productDetails)
        const images = [req.files.image_0, req.files.image_1, req.files.image_2, req.files.image_3]

        // Set default empty strings for image fields to avoid null constraint issues
        productData.productImage0 = ''
        productData.productImage1 = ''
        productData.productImage2 = ''
        productData.productImage3 = ''
        productData.productFileName = '' // Legacy field no longer used

        // Handle category IDs - set to null if not provided or empty
        productData.category2ID = productData.category2ID || null
        productData.category3ID = productData.category3ID || null

        // Add the new product first to get the productID
        const newProduct = await addProduct(productData)
        const productID = newProduct.insertId

        // Process images if provided, now that we have the productID
        if (images && images.some(img => img)) {
            const imagesUpdated = await updateProductImages(images, productID)
            if (!imagesUpdated) {
                console.error('Failed to add product images')
                return res.status(500).json({
                    error: 'Failed to add product images',
                })
            }
        }

        // Get the newly added product data (including updated image filenames)
        const addedProduct = await getProductById(productID)

        // Add image URLs to the added product
        addedProduct.imageUrls = generateProductImageUrls(addedProduct, req)

        // Send the added product data back to frontend
        res.json(addedProduct)
    } catch (error) {
        console.error('Error in addProductController:', error)
        res.status(500).json({
            error: 'Failed to add product',
            message: error.message,
        })
    }
}
