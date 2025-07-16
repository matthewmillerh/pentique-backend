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
// Also cleans up orphaned images that exist in folder but not in database
// Always returns array of exactly 4 URLs (empty string for missing images)
export const generateProductImageUrls = (product, req) => {
    const baseImageUrl = `${req.protocol}://${req.get('host')}/images`
    const productID = product.productID.toString()
    const productDir = path.join('images/products', productID)

    // Initialize array with 4 empty strings
    const imageUrls = ['', '', '', '']
    const validImageNames = new Set()

    console.log(`Generating URLs for Product ${productID}:`)
    console.log(
        `  Database images: ${product.productImage0 || 'none'}, ${product.productImage1 || 'none'}, ${product.productImage2 || 'none'}, ${product.productImage3 || 'none'}`,
    )

    // Get database image values for each slot
    const dbImageNames = [
        product.productImage0,
        product.productImage1,
        product.productImage2,
        product.productImage3,
    ]

    // Check for images with predictable naming: productID_0.jpg, productID_1.jpg, etc.
    let foundPredictableImages = 0
    for (let i = 0; i < 4; i++) {
        const fileName = `${productID}_${i}.jpg`
        const imagePath = path.join(productDir, fileName)

        if (fs.existsSync(imagePath)) {
            // Only include if there's a corresponding database value OR if we're using predictable naming exclusively
            if (dbImageNames[i] || dbImageNames.every(name => !name)) {
                imageUrls[i] = `${baseImageUrl}/products/${productID}/${fileName}`
                validImageNames.add(fileName)
                foundPredictableImages++
            } else {
                // Delete image that exists but has no database reference
                try {
                    fs.unlinkSync(imagePath)
                    console.log(`  🗑️  Deleted image with no DB reference: ${fileName}`)
                } catch (deleteError) {
                    console.error(`  ❌ Failed to delete ${fileName}:`, deleteError.message)
                }
            }
        }
    }

    console.log(`  Valid predictable images: ${foundPredictableImages}`)

    // If no images found with new naming, fallback to database filenames
    if (foundPredictableImages === 0) {
        console.log(`  Falling back to database filenames...`)
        const imageFields = ['productImage0', 'productImage1', 'productImage2', 'productImage3']

        imageFields.forEach((field, index) => {
            const imageName = product[field]
            if (imageName) {
                const imagePath = path.join(productDir, imageName)
                console.log(
                    `  Checking DB image: ${imagePath} - ${fs.existsSync(imagePath) ? 'EXISTS' : 'NOT FOUND'}`,
                )
                if (fs.existsSync(imagePath)) {
                    imageUrls[index] = `${baseImageUrl}/products/${productID}/${imageName}`
                    validImageNames.add(imageName)
                }
            }
        })
    }

    // Clean up any remaining orphaned images in the directory
    if (fs.existsSync(productDir)) {
        try {
            const allFiles = fs.readdirSync(productDir)
            const orphanedFiles = allFiles.filter(file => !validImageNames.has(file))

            if (orphanedFiles.length > 0) {
                console.log(
                    `  Found ${orphanedFiles.length} orphaned files to delete:`,
                    orphanedFiles,
                )

                orphanedFiles.forEach(file => {
                    try {
                        const filePath = path.join(productDir, file)
                        fs.unlinkSync(filePath)
                        console.log(`  🗑️  Deleted orphaned image: ${file}`)
                    } catch (deleteError) {
                        console.error(`  ❌ Failed to delete ${file}:`, deleteError.message)
                    }
                })
            }
        } catch (readError) {
            console.error(`  ❌ Failed to read product directory:`, readError.message)
        }
    }

    // Check if we have any images at all
    const hasAnyImages = imageUrls.some(url => url !== '')
    if (!hasAnyImages) {
        console.log(`  No images found, setting first slot to default no-image.png`)
        imageUrls[0] = `${baseImageUrl}/no-image.png`
    }

    console.log(`  Final URLs array [4]: ${JSON.stringify(imageUrls)}`)
    return imageUrls
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
