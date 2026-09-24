import { getAllProductsForExport } from '../models/productModel.js'
import { getCategoryIndex } from '../models/categoryModel.js'
import { buildCatalogueStats } from '../utils/catalogueStats.js'

// Figures for the admin Stats page, worked out from the catalogue as it is right now
export const catalogueStatsController = async (req, res) => {
    try {
        const [products, index] = await Promise.all([getAllProductsForExport(), getCategoryIndex()])
        res.setHeader('Cache-Control', 'no-store')
        res.json(buildCatalogueStats(products, index))
    } catch (error) {
        console.error('Error in catalogueStatsController:', error)
        res.status(500).json({ message: 'The stats could not be worked out due to a server error.' })
    }
}
