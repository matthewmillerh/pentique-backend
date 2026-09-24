// Replaces the product stock status text ('In Stock' / 'Out of Stock' / 'Limited Stock') with a stock count,
// where 0 means out of stock.
//
// The old statuses carry no count, so products that were in stock start with a count of 1 and out of stock
// products with 0. The real counts are then entered in the admin.
//
// Safe to re-run. The old productStockStatus column is left in place (no longer used, and no longer required) so
// this can be rolled back by dropping productStock. Remove it in a later clean-up migration once happy.
//
// Usage (from the server directory), normally through the runner: npm run migrate
//   NODE_ENV=development node migrations/002-product-stock-count.js
import db, { executeQuery } from '../config/database.js'

// The pool is configured with bigNumberStrings, so COUNT(*) comes back as a string
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

    // 1. The stock count. It is added and filled in one go, so there is never a moment where every product reads
    // as out of stock.
    if (!(await columnExists('product', 'productStock'))) {
        await executeQuery(`
            ALTER TABLE product
            ADD COLUMN productStock INT UNSIGNED NOT NULL DEFAULT 0 AFTER productStockStatus
        `)
        const [filled] = await executeQuery(`
            UPDATE product
            SET productStock = CASE WHEN productStockStatus = 'Out of Stock' THEN 0 ELSE 1 END
        `)
        console.log(`Added product.productStock and filled it for ${filled.affectedRows} products`)

        // Sanity check: every out of stock product is 0, everything else 1
        const mismatched = await scalar(`
            SELECT COUNT(*) FROM product
            WHERE productStock <> CASE WHEN productStockStatus = 'Out of Stock' THEN 0 ELSE 1 END
        `)
        if (mismatched > 0) throw new Error(`${mismatched} products got the wrong stock count`)
    } else {
        console.log('product.productStock already exists')
    }

    // 2. The old status column is no longer written, so it must stop being required
    const [[statusColumn]] = await executeQuery(`
        SELECT IS_NULLABLE AS nullable FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'product' AND column_name = 'productStockStatus'
    `)
    if (statusColumn && statusColumn.nullable !== 'YES') {
        await executeQuery('ALTER TABLE product MODIFY productStockStatus VARCHAR(45) NULL DEFAULT NULL')
        console.log('product.productStockStatus is no longer required')
    }

    console.log(
        `In stock: ${await scalar('SELECT COUNT(*) FROM product WHERE productStock > 0')}, ` +
            `out of stock: ${await scalar('SELECT COUNT(*) FROM product WHERE productStock = 0')}`,
    )
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
