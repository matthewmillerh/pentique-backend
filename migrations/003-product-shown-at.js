// Adds product.productShownAt: when a product last became visible (productHidden went from 1 to 0), used for the
// "New Arrivals" row and page. Left NULL for every existing product (nothing already on the shop counts as a "new"
// arrival on day one - a NULL date never falls inside the 7 day window). Only products shown from now on, by
// actually toggling their visibility, get a real date and can appear as new.
//
// Safe to re-run.
//
// Usage (from the server directory), normally through the runner: npm run migrate
//   NODE_ENV=development node migrations/003-product-shown-at.js
import db, { executeQuery } from '../config/database.js'

const scalar = async (query, params = []) => {
    const [rows] = await executeQuery(query, params)
    const value = Object.values(rows[0])[0]
    return typeof value === 'string' && value !== '' && !isNaN(value) ? Number(value) : value
}

const columnExists = async (table, column) =>
    (await scalar(
        'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        [table, column],
    )) > 0

const run = async () => {
    console.log(`Migrating database "${await scalar('SELECT DATABASE()')}"`)

    if (!(await columnExists('product', 'productShownAt'))) {
        await executeQuery(`
            ALTER TABLE product
            ADD COLUMN productShownAt DATETIME NULL DEFAULT NULL AFTER productHidden
        `)
        console.log('Added product.productShownAt (left NULL - nothing already on the shop counts as a new arrival)')
    } else {
        console.log('product.productShownAt already exists')
    }

    console.log('Done')
}

try {
    await run()
} catch (error) {
    console.error('Migration failed:', error.message)
    process.exitCode = 1
} finally {
    await db.end()
}
