import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getUser } from '../models/authorizationModel.js'
import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV || 'development'
dotenv.config({
    path: `./.env.${NODE_ENV}`,
})

const JWT_SECRET = process.env.JWT_SECRET || 'key'

export const login = async (req, res) => {
    const { email, password } = req.body

    try {
        // Fetch user from the database using async/await model
        const user = await getUser(email)

        // 2. Check if a user was found
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' })
        }

        // Compare password using promise-based bcrypt.compare
        const isMatch = await bcrypt.compare(password, user.administratorPassword)

        if (isMatch) {
            // Generate a JWT token
            const token = jwt.sign(
                { id: user.administratorID, email: user.administratorEmail },
                JWT_SECRET,
                { expiresIn: '1h' }, // Token expires in 1 hour
            )

            // Exclude the hashed password from the user object sent to the client
            const { administratorPassword, ...userWithoutPassword } = user

            // Return the token and sanitized user info
            res.json({ message: 'Login successful', token, user: userWithoutPassword })
        } else {
            console.log('Password comparison failed for email:', email)
            return res.status(401).json({ message: 'Invalid email or password' })
        }
    } catch (error) {
        // Catch any errors from database operations or bcrypt
        console.error('Login error:', error)
        res.status(500).json({ message: 'An unexpected error occurred during login.' })
    }
}

console.log(NODE_ENV)
