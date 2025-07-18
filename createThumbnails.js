import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Thumbnail settings optimized for fast loading
const THUMBNAIL_CONFIG = {
    width: 200, // Good balance of quality vs file size
    quality: 80, // Significant compression while maintaining quality
    progressive: true, // Progressive JPEG for better perceived loading
    stripMetadata: true, // Remove EXIF data to reduce file size
}

const createThumbnails = async () => {
    const productsDir = path.join(__dirname, 'images', 'products')

    console.log('🖼️  Starting thumbnail generation...')
    console.log(`📁 Scanning directory: ${productsDir}`)

    if (!fs.existsSync(productsDir)) {
        console.error('❌ Products directory does not exist:', productsDir)
        return
    }

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
                    // Force regeneration with new quality setting - skip timestamp check
                    console.log(`  🔄 Regenerating ${imageFile} with 80% quality...`)

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
