import mysql from 'mysql2/promise'
import dotenv from 'dotenv'

dotenv.config()

const host = process.env.DB_URL
const userName = process.env.DB_USERNAME
const password = process.env.DB_PASSWORD
const database = process.env.DB_NAME

const db = mysql.createPool({
    host: host,
    user: userName,
    password: password,
    database: database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
})

export default db
