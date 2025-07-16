//import db connection
import db, { executeQuery } from '../config/database.js'

// Get user by email
export const getUser = async email => {
    const queryString = `SELECT * FROM administrator WHERE administratorEmail = ?`

    try {
        const results = await executeQuery(queryString, [email])
        return results[0][0]
    } catch (error) {
        console.error('Database error in getUser:', error)
        throw error
    }
}
