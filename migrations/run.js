// Runs every migration in this folder that has not been applied to the database yet, in order.
// Applied migrations are recorded in the schema_migrations table, so running this again only runs new ones.
// Each migration is its own script (NNN-description.js) and is safe to re-run on its own as well.
//
// Usage (from the server directory):
//   NODE_ENV=development npm run migrate     (local / dev database)
//   NODE_ENV=production npm run migrate      (production, take a backup first)
//   add -- --status to only list what has and has not been applied
import { spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import db from '../config/database.js'

const migrationsDir = path.dirname(fileURLToPath(import.meta.url))
const statusOnly = process.argv.includes('--status')

const run = async () => {
    const [[{ database }]] = await db.query('SELECT DATABASE() AS `database`')
    console.log(`Database "${database}" (NODE_ENV=${process.env.NODE_ENV || 'development'})`)

    await db.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name VARCHAR(255) NOT NULL PRIMARY KEY,
            appliedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `)

    const files = fs
        .readdirSync(migrationsDir)
        .filter(file => /^\d{3}-.+\.js$/.test(file))
        .sort()
    const [rows] = await db.query('SELECT name FROM schema_migrations')
    const applied = new Set(rows.map(row => row.name))
    const pending = files.filter(file => !applied.has(file))

    files.forEach(file => console.log(`  ${applied.has(file) ? 'applied' : 'pending'}  ${file}`))
    if (statusOnly || pending.length === 0) {
        if (!pending.length) console.log('Nothing to migrate')
        return
    }

    for (const file of pending) {
        console.log(`\n=== ${file}`)
        // Each migration runs in its own process, with the same NODE_ENV, and stops the run if it fails
        const result = spawnSync(process.execPath, [path.join(migrationsDir, file)], {
            stdio: 'inherit',
            env: process.env,
        })
        if (result.status !== 0) {
            throw new Error(`${file} failed, later migrations were not run`)
        }
        await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [file])
    }
    console.log('\nAll migrations applied')
}

try {
    await run()
} catch (error) {
    console.error('Migration run failed:', error.message)
    process.exitCode = 1
} finally {
    await db.end()
}
