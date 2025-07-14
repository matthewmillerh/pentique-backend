import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import db from './config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Base paths
const OLD_IMAGES_BASE = path.resolve(__dirname, 'images')
const NEW_IMAGES_BASE = path.resolve(__dirname, 'images/products')

// Ensure the new products directory exists
if (!fs.existsSync(NEW_IMAGES_BASE)) {
    fs.mkdirSync(NEW_IMAGES_BASE, { recursive: true })
    console.log('Created products directory:', NEW_IMAGES_BASE)
}

// Function to get all products from database
async function getAllProducts() {
    try {
        const query = `
            SELECT 
                productID,
                productName,
                category1ID,
                category2ID,
                category3ID,
                productImage0,
                productImage1,
                productImage2,
                productImage3
            FROM product
        `
        const [results] = await db.query(query)
        return results
    } catch (error) {
        console.error('Error fetching products:', error)
        throw error
    }
}

// Function to get category names by IDs
async function getCategoryNames(category1ID, category2ID, category3ID) {
    try {
        const categories = { category1Name: null, category2Name: null, category3Name: null }

        if (category1ID) {
            const [cat1] = await db.query(
                'SELECT category1Name FROM category1 WHERE category1ID = ?',
                [category1ID],
            )
            categories.category1Name = cat1[0]?.category1Name
        }

        if (category2ID) {
            const [cat2] = await db.query(
                'SELECT category2Name FROM category2 WHERE category2ID = ?',
                [category2ID],
            )
            categories.category2Name = cat2[0]?.category2Name
        }

        if (category3ID) {
            const [cat3] = await db.query(
                'SELECT category3Name FROM category3 WHERE category3ID = ?',
                [category3ID],
            )
            categories.category3Name = cat3[0]?.category3Name
        }

        return categories
    } catch (error) {
        console.error('Error fetching category names:', error)
        return { category1Name: null, category2Name: null, category3Name: null }
    }
}

// Function to find image file in old structure
function findImageInOldStructure(imageName, category1Name, category2Name, category3Name) {
    const possiblePaths = [
        // Try all possible combinations of categories
        path.join(
            OLD_IMAGES_BASE,
            category1Name || '',
            category2Name || '',
            category3Name || '',
            imageName,
        ),
        path.join(OLD_IMAGES_BASE, category1Name || '', category2Name || '', imageName),
        path.join(OLD_IMAGES_BASE, category1Name || '', imageName),
        // Also try without any categories (direct in images folder)
        path.join(OLD_IMAGES_BASE, imageName),
    ].filter(p => {
        // Remove paths with empty segments
        const normalizedPath = path.normalize(p).replace(/\\\\/g, '\\')
        return !normalizedPath.includes('\\\\') && !normalizedPath.includes('//')
    })

    for (const imagePath of possiblePaths) {
        if (fs.existsSync(imagePath)) {
            return imagePath
        }
    }

    return null
}

// Function to move and convert image to new structure with predictable naming
async function moveAndConvertImage(oldPath, productID, imageIndex) {
    try {
        const newProductDir = path.join(NEW_IMAGES_BASE, productID.toString())

        // Create product directory if it doesn't exist
        if (!fs.existsSync(newProductDir)) {
            fs.mkdirSync(newProductDir, { recursive: true })
        }

        // New predictable filename: productID_0.jpg, productID_1.jpg, etc.
        const newFileName = `${productID}_${imageIndex}.jpg`
        const newImagePath = path.join(newProductDir, newFileName)

        // Convert to JPG using Sharp
        await sharp(oldPath)
            .jpeg({
                quality: 85,
                progressive: true,
            })
            .toFile(newImagePath)

        console.log(`✅ Converted and moved: ${oldPath} -> ${newImagePath}`)
        return true
    } catch (error) {
        console.error(`❌ Failed to convert and move ${oldPath}:`, error.message)
        return false
    }
}

// Main restructuring function
async function restructureImages() {
    console.log('🚀 Starting image restructuring...')

    try {
        // Get all products from database
        const products = await getAllProducts()
        console.log(`Found ${products.length} products in database`)

        let movedCount = 0
        let notFoundCount = 0

        for (const product of products) {
            console.log(`\n📦 Processing Product ID: ${product.productID}`)

            // Get category names
            const { category1Name, category2Name, category3Name } = await getCategoryNames(
                product.category1ID,
                product.category2ID,
                product.category3ID,
            )

            console.log(
                `   Categories: ${category1Name || 'N/A'} / ${category2Name || 'N/A'} / ${category3Name || 'N/A'}`,
            )

            // Process each image with index for predictable naming
            const imageFields = ['productImage0', 'productImage1', 'productImage2', 'productImage3']

            for (let imageIndex = 0; imageIndex < imageFields.length; imageIndex++) {
                const imageField = imageFields[imageIndex]
                const imageName = product[imageField]

                if (imageName) {
                    console.log(`   🔍 Looking for image: ${imageName}`)

                    // Find image in old structure
                    const oldImagePath = findImageInOldStructure(
                        imageName,
                        category1Name,
                        category2Name,
                        category3Name,
                    )

                    if (oldImagePath) {
                        // Convert and move to new structure with predictable naming
                        const success = await moveAndConvertImage(
                            oldImagePath,
                            product.productID,
                            imageIndex,
                        )
                        if (success) {
                            movedCount++
                        }
                    } else {
                        console.log(`   ⚠️  Image not found: ${imageName}`)
                        notFoundCount++
                    }
                }
            }
        }

        console.log('\n🎉 Restructuring complete!')
        console.log(`✅ Images converted and moved: ${movedCount}`)
        console.log(`⚠️  Images not found: ${notFoundCount}`)
        console.log('\n📝 All images have been:')
        console.log('   - Converted to JPG format (quality 85%, progressive)')
        console.log('   - Renamed to predictable format: productID_0.jpg, productID_1.jpg, etc.')
        console.log('   - Moved to /images/products/productID/ structure')
    } catch (error) {
        console.error('❌ Error during restructuring:', error)
    } finally {
        // Close database connection
        await db.end()
    }
}

// Run the script
console.log('='.repeat(50))
console.log('IMAGE RESTRUCTURING SCRIPT')
console.log('='.repeat(50))
console.log('Old structure: /images/category1/category2/category3/image.jpg')
console.log('New structure: /images/products/productID/productID_0.jpg')
console.log('Features: Convert to JPG + Predictable naming')
console.log('='.repeat(50))

restructureImages().catch(console.error)
