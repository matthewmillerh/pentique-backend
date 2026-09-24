import { getAllProductsForExport } from '../models/productModel.js'
import { getCategoryIndex } from '../models/categoryModel.js'
import { buildCatalogueWorkbook, catalogueFileName } from '../utils/catalogueExport.js'

// Download the whole product catalogue (every product and category) as an Excel workbook
export const exportCatalogueController = async (req, res) => {
    try {
        const [products, index] = await Promise.all([getAllProductsForExport(), getCategoryIndex()])
        const imagesUrl = `${process.env.HTTP_PROTOCOL || req.protocol}://${req.get('host')}/images`
        const now = new Date()
        const workbook = buildCatalogueWorkbook(products, index, imagesUrl, now)

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        res.setHeader('Content-Disposition', `attachment; filename="${catalogueFileName(now)}"`)
        // the browser has to be allowed to read the file name when the download is started from a script
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition')
        res.setHeader('Cache-Control', 'no-store')
        await workbook.xlsx.write(res)
        res.end()
    } catch (error) {
        console.error('Error in exportCatalogueController:', error)
        if (!res.headersSent) {
            res.status(500).json({ message: 'The catalogue could not be exported due to a server error.' })
        } else {
            res.destroy(error)
        }
    }
}
