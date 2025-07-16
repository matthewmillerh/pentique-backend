import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV || 'development'
dotenv.config({
    path: `./.env.${NODE_ENV}`,
})

const host = process.env.DB_URL
const userName = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const database = process.env.DB_NAME

const db = mysql.createPool({
    host: host,
    user: userName,
    password: password,
    database: database,
    // Valid MySQL2 pool configuration
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // Valid connection settings
    charset: 'utf8mb4',
    timezone: '+00:00',
    // Additional valid settings
    supportBigNumbers: true,
    bigNumberStrings: true,
    // Keep alive at TCP level (valid for Node.js sockets)
    keepAliveInitialDelay: 0,
    enableKeepAlive: true,
})

// Enhanced executeQuery with better error handling and exponential backoff
const executeQuery = async (query, params = [], retries = 3) => {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await db.query(query, params)
        } catch (error) {
            console.error(`Query attempt ${attempt} failed:`, error.message)

            if (attempt === retries) {
                throw error
            }

            // Handle connection errors with exponential backoff
            if (
                error.code === 'ECONNRESET' ||
                error.code === 'PROTOCOL_CONNECTION_LOST' ||
                error.code === 'ENOTFOUND' ||
                error.code === 'ETIMEDOUT' ||
                error.code === 'ECONNREFUSED'
            ) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Max 10 seconds
                console.log(`Retrying query in ${delay}ms... (attempt ${attempt + 1}/${retries})`)
                await new Promise(resolve => setTimeout(resolve, delay))
            } else {
                throw error
            }
        }
    }
}

// Connection health check function
const testConnection = async () => {
    try {
        await db.query('SELECT 1')
        console.log('✅ Database connection healthy')
        return true
    } catch (error) {
        console.error('❌ Database connection test failed:', error.message)
        return false
    }
}

// Error handling
db.on('connection', connection => {
    console.log('Database connected as id', connection.threadId)
})

db.on('error', err => {
    console.error('Database pool error:', err)
    if (err.code === 'PROTOCOL_CONNECTION_LOST' || err.code === 'ECONNRESET') {
        console.log('Connection lost, pool will handle reconnection...')
    }
})

// Periodic health check (every 5 minutes)
setInterval(testConnection, 5 * 60 * 1000)

// Initial connection test
testConnection()

export default db
export { executeQuery, testConnection }
