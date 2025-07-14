import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// // Helper function to determine correct image path (new vs old structure)
// export const getCorrectImagePath = (imageName, segments) => {
//     // Try new structure first (with productID folder)
//     const newPath = path.join('images', ...segments, imageName)

//     // Fallback to old structure (without productID folder - remove last segment)
//     const oldSegments = segments.slice(0, -1)
//     const oldPath = path.join('images', ...oldSegments, imageName)

//     if (fs.existsSync(newPath)) {
//         return segments.join('/')
//     } else if (fs.existsSync(oldPath)) {
//         return oldSegments.join('/')
//     } else {
//         // Default to new structure if neither exists
//         return segments.join('/')
//     }
// }

// Generate image URLs for a product with predictable naming
export const generateProductImageUrls = (product, req) => {
    const baseImageUrl = `${req.protocol}://${req.get('host')}/images`
    const productID = product.productID.toString()

    const imageUrls = []

    // Check for images with predictable naming: productID_0.jpg, productID_1.jpg, etc.
    for (let i = 0; i < 4; i++) {
        const fileName = `${productID}_${i}.jpg`
        const imagePath = path.join('images/products', productID, fileName)

        if (fs.existsSync(imagePath)) {
            imageUrls.push(`${baseImageUrl}/products/${productID}/${fileName}`)
        }
    }

    // If no images found with new naming, fallback to database filenames
    if (imageUrls.length === 0) {
        const imageNames = [
            product.productImage0,
            product.productImage1,
            product.productImage2,
            product.productImage3,
        ].filter(Boolean)

        imageNames.forEach(imageName => {
            const imagePath = path.join('images/products', productID, imageName)
            if (fs.existsSync(imagePath)) {
                imageUrls.push(`${baseImageUrl}/products/${productID}/${imageName}`)
            }
        })
    }

    if (imageUrls.length === 0) {
        imageUrls.push(`${baseImageUrl}/no-image.png`)
    }

    return imageUrls
}

// Deletes the specified category directory and all its contents
export const deleteCategoryDirectory = category => {
    const categoryPathBase = path.resolve(__dirname, '../../pentique/public/images/', category)
    let categoryPath = categoryPathBase

    if (!fs.existsSync(categoryPath)) {
        console.error(`Category directory does not exist: ${categoryPath}`)
        return false
    }

    // Recursively delete all files and subdirectories
    fs.readdirSync(categoryPath).forEach(file => {
        const filePath = `${categoryPath}/${file}`
        if (fs.statSync(filePath).isDirectory()) {
            deleteCategoryDirectory(filePath)
        } else {
            fs.unlinkSync(filePath)
        }
    })

    // Remove the empty directory
    fs.rmSync(categoryPath)

    return true
}

// Creates a directory for the specified category
export const createCategoryDirectory = category => {
    const categoryPathBase = path.resolve(__dirname, '../../pentique/public/images/', category)
    let categoryPath = categoryPathBase

    if (fs.existsSync(categoryPath)) {
        console.error(`Category directory already exists: ${categoryPath}`)
        return false
    }

    try {
        fs.mkdirSync(categoryPath, { recursive: true })
        return true
    } catch (error) {
        console.error(`Failed to create category directory: ${error.message}`)
        return false
    }
}

// Updates product images by copying them to the appropriate directory
// Converts all images to JPG format with predictable naming: productID_0.jpg, productID_1.jpg, etc.
export const updateProductImages = async (images, productID) => {
    console.log('updateProductImages called with:', {
        imagesType: typeof images,
        imagesKeys: Object.keys(images || {}),
        productID,
    })

    const basePath = path.join(
        '../images/products',
        productID.toString(), // Use the product ID as the final directory
    )
    const productPath = path.resolve(__dirname, basePath)

    // Create the product directory if it doesn't exist
    if (!fs.existsSync(productPath)) {
        try {
            fs.mkdirSync(productPath, { recursive: true })
            console.log(`Created product directory: ${productPath}`)
        } catch (error) {
            console.error(`Failed to create product directory: ${error.message}`)
            return false
        }
    }

    // Process images with predictable naming and convert to JPG
    for (let i = 0; i < 4; i++) {
        let file = images[i] ? images[i][0] : null
        console.log(
            `Processing slot ${i}:`,
            file
                ? {
                      originalname: file.originalname,
                      mimetype: file.mimetype,
                      size: file.size,
                      hasBuffer: !!file.buffer,
                  }
                : 'No file',
        )

        if (file) {
            // Predictable filename: productID_0.jpg, productID_1.jpg, etc.
            let fileName = `${productID}_${i}.jpg`
            const destPath = path.join(productPath, fileName)

            try {
                if (file.buffer && Buffer.isBuffer(file.buffer)) {
                    // Convert to JPG using Sharp
                    const jpegBuffer = await sharp(file.buffer)
                        .jpeg({
                            quality: 85,
                            progressive: true,
                        })
                        .toBuffer()

                    fs.writeFileSync(destPath, jpegBuffer)
                    console.log(`Saved and converted: ${fileName}`)
                } else {
                    console.error(`File object missing valid buffer for ${fileName}:`, {
                        hasBuffer: !!file.buffer,
                        bufferType: typeof file.buffer,
                        isBuffer: file.buffer ? Buffer.isBuffer(file.buffer) : false,
                        fileKeys: Object.keys(file || {}),
                    })
                }
            } catch (err) {
                console.error(
                    `Failed to process image ${file.originalname || 'unknown'}: ${err.message}`,
                )
            }
        }
    }

    return true
}

// Deletes product images by removing the product directory
export const deleteProductImages = productID => {
    const basePath = path.join('../images/products', productID.toString())
    const productPath = path.resolve(__dirname, basePath)

    if (!fs.existsSync(productPath)) {
        console.error(`Product directory does not exist: ${productPath}`)
        return false
    }

    try {
        fs.rmSync(productPath, { recursive: true })
        console.log(`Deleted product images directory: ${productPath}`)
    } catch (error) {
        console.error(`Failed to delete product images: ${error.message}`)
        return false
    }

    return true
}
