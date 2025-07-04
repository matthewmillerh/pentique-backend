import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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
// The categories array should contain the category names in order
export const updateProductImages = (categories, images, productID) => {
    const basePath = path.join(
        '../../pentique/public/images',
        categories[0], // Use the first category as the base path
        categories[1] || '', // Use the second category if it exists
        categories[2] || '', // Use the third category if it exists
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

    // Copy images received from multer to the directory, overwriting if exists
    for (let i = 0; i < 4; i++) {
        let file = images[i] ? images[i][0] : null
        if (file) {
            // Add _index to the filename to avoid conflicts
            let fileName = `${path.basename(file.originalname, path.extname(file.originalname))}_${i}${path.extname(file.originalname)}`

            const destPath = path.join(productPath, fileName)
            try {
                // Overwrite the file if it already exists
                if (file.buffer) {
                    fs.writeFileSync(destPath, file.buffer) // writeFileSync overwrites by default
                } else {
                    console.error(
                        `File object missing buffer or path property: ${JSON.stringify(file)}`,
                    )
                }
            } catch (err) {
                console.error(`Failed to copy image ${file.originalname}: ${err.message}`)
            }
        }
    }

    return true
}

// Deletes product images by removing the product directory
// The categories array should contain the category names in order
export const deleteProductImages = (categories, productID) => {
    const basePath = path.join(
        '../../pentique/public/images',
        categories[0], // Use the first category as the base path
        categories[1] || '', // Use the second category if it exists
        categories[2] || '', // Use the third category if it exists
        productID.toString(), // Use the product ID as the final directory
    )
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
