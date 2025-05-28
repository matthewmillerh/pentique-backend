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
    fs.rmdirSync(categoryPath)

    return true
}
