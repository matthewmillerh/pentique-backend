//import functions from Product model
import {
    getProductsByCategory,
    getProductById,
    updateProductById,
    deleteProductById,
    addProduct,
    moveProducts,
    updateProducts,
    deleteProducts,
    searchProducts,
} from '../models/productModel.js'
import { getCategoryIndex, getCategory, subtreeIDs, categoryPath } from '../models/categoryModel.js'
import {
    updateProductImages,
    deleteProductImages,
    generateProductImageUrls,
} from '../utils/file.js'

// The storefront only needs to know whether a product can be bought, 0 in stock means out of stock
const stockStatus = count => (Number(count) > 0 ? 'In Stock' : 'Out of Stock')

// Send a product back without the columns of the old three level category structure and the old stock status
// text, with the stock status worked out from the stock count instead
const forClient = ({ category1ID, category2ID, category3ID, productStockStatus, ...product }) => ({
    ...product,
    productStockStatus: stockStatus(product.productStock),
})

// Stock is a whole number, 0 or more, anything else gives null
const toStockCount = value => {
    const count = Number(value)
    return value !== '' && value !== null && Number.isInteger(count) && count >= 0 ? count : null
}

const invalidStockResponse = res =>
    res.status(400).json({ error: 'Invalid stock', message: 'Stock must be a whole number, 0 or more.' })

// A duplicate product code is a mistake the admin can fix, so explain it instead of failing with a 500
const duplicateCodeResponse = (res, error, req) => {
    if (error.code !== 'ER_DUP_ENTRY' || !/productCode/.test(error.message)) return null
    let code = ''
    try {
        code = JSON.parse(req.body.productDetails).productCode
    } catch {
        // the code is only used to make the message friendlier
    }
    const message = `A product with the code "${code}" already exists. Please use a different product code.`
    return res.status(409).json({ error: message, message })
}

// A value longer than its column allows (the product code is at most 11 characters), explained instead of a 500
const TOO_LONG_MESSAGES = {
    productCode: 'The product code can be at most 11 characters',
    productName: 'The product name is too long',
    productDescription: 'The description is too long',
}
const tooLongResponse = (res, error) => {
    if (error.code !== 'ER_DATA_TOO_LONG') return null
    const column = /column '(\w+)'/.exec(error.message)?.[1]
    const message = `${TOO_LONG_MESSAGES[column] || 'One of the fields is too long'}. Please shorten it and try again.`
    return res.status(400).json({ error: message, message })
}

// A product's category, plus the path down to it, so the client can show where it lives
const addCategoryPath = async product => {
    const index = await getCategoryIndex()
    product.categoryPath = categoryPath(index, product.categoryID)
    return product
}

// Get the products in a category and all of its subcategories
export const getProductsByCategoryController = async (req, res) => {
    try {
        const categoryID = Number(req.params.categoryID)
        const category = Number.isInteger(categoryID) ? await getCategory(categoryID) : null
        if (!category) {
            return res.status(404).json({ error: 'Category not found' })
        }

        const index = await getCategoryIndex()
        const products = await getProductsByCategory(subtreeIDs(index, categoryID))
        products.forEach(product => {
            product.imageUrls = generateProductImageUrls(product, req)
            product.productStockStatus = stockStatus(product.productStock)
        })
        res.json({ category, products })
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

        res.json(await addCategoryPath(forClient(product)))
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

        productData.productStock = toStockCount(productData.productStock)
        if (productData.productStock === null) {
            return invalidStockResponse(res)
        }

        if (!(await getCategory(Number(productData.categoryID)))) {
            return res.status(400).json({ error: 'A valid category is required' })
        }

        const existing = await getProductById(productData.productID)
        if (!existing) {
            return res.status(404).json({ error: 'Product not found' })
        }

        // The client can only clear an image slot (to delete that image). The file names themselves are decided
        // here: slots keep their current name and newly uploaded images get theirs from updateProductImages.
        for (let i = 0; i < 4; i++) {
            const field = `productImage${i}`
            productData[field] = productData[field] ? existing[field] : ''
        }

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
                    message:
                        'The product details were saved, but one or more images could not be processed. Please make sure they are JPG, PNG or WebP images and try again.',
                })
            }
        }

        // Get the updated product data (including new image filenames)
        const updatedProduct = await getProductById(productData.productID)

        // Add image URLs to the updated product
        updatedProduct.imageUrls = generateProductImageUrls(updatedProduct, req)

        // Send the updated product data back to frontend
        res.json(await addCategoryPath(forClient(updatedProduct)))
    } catch (error) {
        if (duplicateCodeResponse(res, error, req)) return
        if (tooLongResponse(res, error)) return
        console.error('Error in updateProductByIdController:', error)
        res.status(500).json({
            error: 'Failed to update product',
            message: error.message,
        })
    }
}

// Delete a product by productID
export const deleteProductByIdController = async (req, res) => {
    const productID = Number(req.body?.product?.productID)
    if (!Number.isInteger(productID) || productID <= 0) {
        return res.status(400).json({ error: 'A valid product is required', message: 'A valid product is required.' })
    }

    try {
        const result = await deleteProductById(productID)
        if (!result || result.affectedRows === 0) {
            return res.status(404).json({ error: 'Product not found', message: 'This product no longer exists.' })
        }

        // Remove images associated with the product, a failure here must not undo or fail the delete itself
        try {
            deleteProductImages(productID)
        } catch (imageError) {
            console.error(`Failed to remove images of deleted product ${productID}:`, imageError)
        }

        res.json({ message: 'Product deleted successfully' })
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

        productData.productStock = toStockCount(productData.productStock)
        if (productData.productStock === null) {
            return invalidStockResponse(res)
        }

        // Set default empty strings for image fields to avoid null constraint issues
        productData.productImage0 = ''
        productData.productImage1 = ''
        productData.productImage2 = ''
        productData.productImage3 = ''
        productData.productFileName = '' // Legacy field no longer used

        if (!(await getCategory(Number(productData.categoryID)))) {
            return res.status(400).json({ error: 'A valid category is required' })
        }

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
                    productID,
                    message:
                        'The product was created, but one or more images could not be processed. Please make sure they are JPG, PNG or WebP images, then add them to the product under Edit Products (do not add the product again).',
                })
            }
        }

        // Get the newly added product data (including updated image filenames)
        const addedProduct = await getProductById(productID)

        // Add image URLs to the added product
        addedProduct.imageUrls = generateProductImageUrls(addedProduct, req)

        // Send the added product data back to frontend
        res.json(await addCategoryPath(forClient(addedProduct)))
    } catch (error) {
        if (duplicateCodeResponse(res, error, req)) return
        if (tooLongResponse(res, error)) return
        console.error('Error in addProductController:', error)
        res.status(500).json({
            error: 'Failed to add product',
            message: error.message,
        })
    }
}

// The product ids for a bulk action: a non-empty list of positive whole numbers (duplicates removed), or null
const toProductIDs = productIDs =>
    Array.isArray(productIDs) &&
    productIDs.length > 0 &&
    productIDs.length <= 1000 &&
    productIDs.every(id => Number.isInteger(id) && id > 0)
        ? [...new Set(productIDs)]
        : null

// Move several products to another category at once
export const moveProductsController = async (req, res) => {
    const productIDs = toProductIDs(req.body?.productIDs)
    const categoryID = req.body?.categoryID

    if (!productIDs) {
        return res.status(400).json({ message: 'Choose between 1 and 1000 products to move.' })
    }
    if (!Number.isInteger(categoryID) || categoryID <= 0 || !(await getCategory(categoryID))) {
        return res.status(400).json({ message: 'Choose a valid category to move the products to.' })
    }

    try {
        const moved = await moveProducts(productIDs, categoryID)
        res.json({ message: `Moved ${moved} product${moved === 1 ? '' : 's'}.`, moved, categoryID })
    } catch (error) {
        console.error('Error in moveProductsController:', error)
        res.status(500).json({ message: 'The products could not be moved due to a server error.' })
    }
}

// Apply the same change to several products at once: hide / show them, or set their stock
export const bulkUpdateProductsController = async (req, res) => {
    const productIDs = toProductIDs(req.body?.productIDs)
    if (!productIDs) {
        return res.status(400).json({ message: 'Choose between 1 and 1000 products.' })
    }

    const input = req.body?.changes || {}
    const changes = {}
    if ('productHidden' in input) {
        if (![true, false, 0, 1].includes(input.productHidden)) {
            return res.status(400).json({ message: 'Hidden must be true or false.' })
        }
        changes.productHidden = input.productHidden ? 1 : 0
    }
    if ('productStock' in input) {
        changes.productStock = toStockCount(input.productStock)
        if (changes.productStock === null) return invalidStockResponse(res)
    }
    if (!Object.keys(changes).length) {
        return res.status(400).json({ message: 'Nothing to change.' })
    }

    try {
        const updated = await updateProducts(productIDs, changes)
        res.json({ message: `Updated ${updated} product${updated === 1 ? '' : 's'}.`, updated, changes })
    } catch (error) {
        console.error('Error in bulkUpdateProductsController:', error)
        res.status(500).json({ message: 'The products could not be updated due to a server error.' })
    }
}

// Delete several products and their images at once
export const bulkDeleteProductsController = async (req, res) => {
    const productIDs = toProductIDs(req.body?.productIDs)
    if (!productIDs) {
        return res.status(400).json({ message: 'Choose between 1 and 1000 products.' })
    }

    try {
        const deleted = await deleteProducts(productIDs)

        // A failure to remove images must not fail the delete itself
        deleted.forEach(productID => {
            try {
                deleteProductImages(productID)
            } catch (imageError) {
                console.error(`Failed to remove images of deleted product ${productID}:`, imageError)
            }
        })

        res.json({ message: `Deleted ${deleted.length} product${deleted.length === 1 ? '' : 's'}.`, deleted: deleted.length })
    } catch (error) {
        console.error('Error in bulkDeleteProductsController:', error)
        res.status(500).json({ message: 'The products could not be deleted due to a server error.' })
    }
}

// Search the store: products whose name, description or category names contain every word of the search
const SEARCH_LIMIT = 60
export const searchProductsController = async (req, res) => {
    const phrase = typeof req.query.q === 'string' ? req.query.q.trim().replace(/\s+/g, ' ').slice(0, 100) : ''
    if (phrase.length < 2) {
        return res.status(400).json({ message: 'Type at least 2 characters to search.' })
    }
    const words = [...new Set(phrase.toLowerCase().split(' '))].slice(0, 8)

    try {
        // one extra, to know whether there were more results than are shown
        const products = await searchProducts(words, phrase, SEARCH_LIMIT + 1)
        const more = products.length > SEARCH_LIMIT
        const shown = products.slice(0, SEARCH_LIMIT)
        shown.forEach(product => {
            product.imageUrls = generateProductImageUrls(product, req)
            product.productStockStatus = stockStatus(product.productStock)
        })
        res.json({ query: phrase, products: shown, more })
    } catch (error) {
        console.error('Error in searchProductsController:', error)
        res.status(500).json({ message: 'Search is not available right now, please try again.' })
    }
}
