import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'
import readline from 'readline'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Thumbnail settings optimized for fast loading
const THUMBNAIL_CONFIG = {
    width: 200, // Good balance of quality vs file size
    quality: 80, // Significant compression while maintaining quality
    progressive: true, // Progressive JPEG for better perceived loading
    stripMetadata: true, // Remove EXIF data to reduce file size
}

// Function to prompt user for overwrite choice
const promptUser = () => {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })

    return new Promise(resolve => {
        console.log('\n📋 Choose an option:')
        console.log('  1. Skip files that already have thumbnails (faster)')
        console.log('  2. Overwrite all thumbnails (regenerate everything)')
        console.log('')

        rl.question('Enter your choice (1 or 2): ', answer => {
            rl.close()
            const choice = answer.trim()
            if (choice === '1') {
                resolve('skip')
            } else if (choice === '2') {
                resolve('overwrite')
            } else {
                console.log('❌ Invalid choice. Defaulting to skip existing files.')
                resolve('skip')
            }
        })
    })
}

const createThumbnails = async () => {
    const productsDir = path.join(__dirname, 'images', 'products')

    console.log('🖼️  Starting thumbnail generation...')
    console.log(`📁 Scanning directory: ${productsDir}`)

    if (!fs.existsSync(productsDir)) {
        console.error('❌ Products directory does not exist:', productsDir)
        return
    }

    // Get user choice for handling existing thumbnails
    const mode = await promptUser()
    const overwriteAll = mode === 'overwrite'

    console.log(
        `\n⚙️  Mode: ${overwriteAll ? 'Overwriting all thumbnails' : 'Skipping existing thumbnails'}`,
    )

    let totalProcessed = 0
    let totalSkipped = 0
    let totalErrors = 0

    try {
        // Get all product directories
        const productDirs = fs
            .readdirSync(productsDir, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)

        console.log(`📂 Found ${productDirs.length} product directories`)

        for (const productID of productDirs) {
            const productPath = path.join(productsDir, productID)
            const thumbsPath = path.join(productPath, 'thumbs')

            console.log(`\n🔄 Processing Product ${productID}:`)

            // Create thumbs directory if it doesn't exist
            if (!fs.existsSync(thumbsPath)) {
                fs.mkdirSync(thumbsPath, { recursive: true })
                console.log(`  📁 Created thumbs directory`)
            }

            // Get all image files in the product directory
            const files = fs.readdirSync(productPath)
            const imageFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase()
                return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) && file !== 'thumbs'
            })

            if (imageFiles.length === 0) {
                console.log(`  ⚠️  No images found`)
                continue
            }

            console.log(`  📸 Found ${imageFiles.length} images: ${imageFiles.join(', ')}`)

            for (const imageFile of imageFiles) {
                const sourcePath = path.join(productPath, imageFile)
                const thumbnailPath = path.join(thumbsPath, imageFile)

                try {
                    // Check if thumbnail already exists and user chose to skip
                    if (!overwriteAll && fs.existsSync(thumbnailPath)) {
                        console.log(`  ⏭️  Skipping ${imageFile} (thumbnail exists)`)
                        totalSkipped++
                        continue
                    }

                    const action = overwriteAll ? 'Regenerating' : 'Creating'
                    console.log(
                        `  🔄 ${action} ${imageFile} with ${THUMBNAIL_CONFIG.quality}% quality...`,
                    )

                    // Generate thumbnail
                    await sharp(sourcePath)
                        .resize(THUMBNAIL_CONFIG.width, null, {
                            withoutEnlargement: true, // Don't upscale small images
                            fit: 'inside', // Maintain aspect ratio
                        })
                        .jpeg({
                            quality: THUMBNAIL_CONFIG.quality,
                            progressive: THUMBNAIL_CONFIG.progressive,
                            mozjpeg: true, // Use mozjpeg encoder for better compression
                        })
                        .toFile(thumbnailPath)

                    // Get file sizes for comparison
                    const originalSize = fs.statSync(sourcePath).size
                    const thumbnailSize = fs.statSync(thumbnailPath).size
                    const compressionRatio = ((1 - thumbnailSize / originalSize) * 100).toFixed(1)

                    console.log(
                        `  ✅ ${imageFile}: ${formatBytes(originalSize)} → ${formatBytes(thumbnailSize)} (${compressionRatio}% smaller)`,
                    )
                    totalProcessed++
                } catch (error) {
                    console.error(`  ❌ Failed to process ${imageFile}:`, error.message)
                    totalErrors++
                }
            }
        }
    } catch (error) {
        console.error('❌ Error scanning products directory:', error.message)
        return
    }

    // Summary
    console.log('\n📊 Thumbnail Generation Summary:')
    console.log(`  ✅ Processed: ${totalProcessed}`)
    console.log(`  ⏭️  Skipped: ${totalSkipped}`)
    console.log(`  ❌ Errors: ${totalErrors}`)
    console.log(`  📁 Total products: ${productDirs.length}`)

    if (totalProcessed > 0) {
        console.log('\n🎉 Thumbnail generation completed successfully!')
    }
}

// Helper function to format file sizes
const formatBytes = bytes => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Run the script
console.log('🚀 Thumbnail Creator Script Started')
console.log(
    `⚙️  Configuration: ${THUMBNAIL_CONFIG.width}px width, ${THUMBNAIL_CONFIG.quality}% quality`,
)
createThumbnails().catch(console.error)
