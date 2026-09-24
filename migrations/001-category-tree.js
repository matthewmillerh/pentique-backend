// Migrates the fixed three level category tables (category1/2/3) to a single self referencing
// `category` table that supports unlimited nesting, and points every product at exactly one category.
//
// Safe to re-run: every step checks whether it has already been applied.
// The old tables and product.category1ID/2ID/3ID columns are left untouched so this can be rolled back
// (DROP the product FK/column and the category table). Remove them in a later migration once happy.
//
// Usage (from the server directory), normally through the runner: npm run migrate
//   NODE_ENV=development node migrations/001-category-tree.js
import db, { executeQuery } from '../config/database.js'

// The pool is configured with bigNumberStrings, so COUNT(*) comes back as a string
const scalar = async (query, params = []) => {
    const [rows] = await executeQuery(query, params)
    const value = Object.values(rows[0])[0]
    return typeof value === 'string' && value !== '' && !isNaN(value) ? Number(value) : value
}

const tableExists = async name =>
    (await scalar(
        'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?',
        [name],
    )) > 0

const columnExists = async (table, column) =>
    (await scalar(
        'SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?',
        [table, column],
    )) > 0

const constraintExists = async name =>
    (await scalar(
        'SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND constraint_name = ?',
        [name],
    )) > 0

const run = async () => {
    console.log(`Migrating database "${await scalar('SELECT DATABASE()')}"`)

    // 1. The category tree table. Deleting a category deletes its (empty) subcategories, the product foreign
    // key below stops any category that still holds products from being deleted.
    if (!(await tableExists('category'))) {
        await executeQuery(`
            CREATE TABLE category (
                categoryID INT NOT NULL AUTO_INCREMENT,
                parentCategoryID INT NULL,
                categoryName VARCHAR(255) NOT NULL,
                legacyLevel TINYINT NULL,
                legacyID INT NULL,
                PRIMARY KEY (categoryID),
                UNIQUE KEY uq_category_sibling_name (parentCategoryID, categoryName),
                KEY idx_category_legacy (legacyLevel, legacyID),
                CONSTRAINT fk_category_parent FOREIGN KEY (parentCategoryID)
                    REFERENCES category (categoryID) ON DELETE CASCADE ON UPDATE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
        `)
        console.log('Created table category')
    }

    // 2. Copy the old levels across. Top level ids are kept as they are so existing /products/<name>/<id>
    // links keep pointing at the same category, deeper levels get new ids.
    let copied = false
    if ((await scalar('SELECT COUNT(*) FROM category')) === 0) {
        copied = true
        await executeQuery(`
            INSERT INTO category (categoryID, parentCategoryID, categoryName, legacyLevel, legacyID)
            SELECT category1ID, NULL, category1Name, 1, category1ID FROM category1
        `)
        await executeQuery(`
            INSERT INTO category (parentCategoryID, categoryName, legacyLevel, legacyID)
            SELECT category1ID, category2Name, 2, category2ID FROM category2 ORDER BY category2ID
        `)
        await executeQuery(`
            INSERT INTO category (parentCategoryID, categoryName, legacyLevel, legacyID)
            SELECT c2.categoryID, c3.category3Name, 3, c3.category3ID
            FROM category3 c3
            JOIN category c2 ON c2.legacyLevel = 2 AND c2.legacyID = c3.category2ID
            ORDER BY c3.category3ID
        `)
        console.log('Copied category1/2/3 into category')
    }

    // 3. Point every product at its deepest category
    if (!(await columnExists('product', 'categoryID'))) {
        await executeQuery('ALTER TABLE product ADD COLUMN categoryID INT NULL AFTER category3ID')
        console.log('Added product.categoryID')
    }
    if ((await scalar('SELECT COUNT(*) FROM category')) === 0 && (await scalar('SELECT COUNT(*) FROM category1')) > 0) {
        throw new Error('category table is empty, refusing to map products')
    }
    const [backfill] = await executeQuery(`
        UPDATE product p
        LEFT JOIN category n3 ON n3.legacyLevel = 3 AND n3.legacyID = p.category3ID
        LEFT JOIN category n2 ON n2.legacyLevel = 2 AND n2.legacyID = p.category2ID
        SET p.categoryID = COALESCE(n3.categoryID, n2.categoryID, p.category1ID)
        WHERE p.categoryID IS NULL
    `)

    const uncategorised = await scalar('SELECT COUNT(*) FROM product WHERE categoryID IS NULL')
    if (uncategorised > 0) {
        throw new Error(`${uncategorised} products could not be mapped to a category, aborting before adding constraints`)
    }

    if (!(await constraintExists('fk_product_category'))) {
        await executeQuery('ALTER TABLE product MODIFY categoryID INT NOT NULL')
        await executeQuery(`
            ALTER TABLE product
            ADD CONSTRAINT fk_product_category FOREIGN KEY (categoryID)
                REFERENCES category (categoryID) ON DELETE RESTRICT ON UPDATE CASCADE
        `)
        console.log('Added product.categoryID foreign key')
    }

    // 4. Sanity checks
    // Only meaningful on the run that did the copy, later the app may legitimately have added categories
    const newCount = await scalar('SELECT COUNT(*) FROM category')
    if (copied) {
        const oldCounts = [
            await scalar('SELECT COUNT(*) FROM category1'),
            await scalar('SELECT COUNT(*) FROM category2'),
            await scalar('SELECT COUNT(*) FROM category3'),
        ]
        const oldTotal = oldCounts.reduce((a, b) => a + b, 0)
        console.log(`Categories: ${oldCounts.join(' + ')} = ${oldTotal} old, ${newCount} new`)
        if (oldTotal !== newCount) throw new Error('Category count mismatch')
    } else {
        console.log(`Categories: ${newCount} (already migrated)`)
    }

    console.log(`Products: ${await scalar('SELECT COUNT(*) FROM product')} total, ${backfill.affectedRows} newly mapped`)

    // Only meaningful on the run that did the mapping, later the app may legitimately have moved products
    if (backfill.affectedRows > 0) {
        const mismatched = await scalar(`
            SELECT COUNT(*) FROM product p
            LEFT JOIN category n3 ON n3.legacyLevel = 3 AND n3.legacyID = p.category3ID
            LEFT JOIN category n2 ON n2.legacyLevel = 2 AND n2.legacyID = p.category2ID
            WHERE p.categoryID <> COALESCE(n3.categoryID, n2.categoryID, p.category1ID)
        `)
        if (mismatched > 0) throw new Error(`${mismatched} products were mapped to the wrong category`)
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
