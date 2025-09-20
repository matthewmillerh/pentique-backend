import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { getUser } from '../models/authorizationModel.js'
import dotenv from 'dotenv'

const NODE_ENV = process.env.NODE_ENV || 'development'
dotenv.config({
    path: `./.env.${NODE_ENV}`,
})

const JWT_SECRET = process.env.JWT_SECRET || 'key'

// Authentication middleware
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Access token required' })
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Invalid or expired token' })
        }
        req.user = user
        next()
    })
}

export const login = async (req, res) => {
    const { email, password } = req.body

    try {
        // Fetch user from the database using async/await model
        const user = await getUser(email)

        // Check if user exists (email validation)
        const emailExists = !!user

        // Check password if user exists
        let passwordValid = false
        if (emailExists) {
            passwordValid = await bcrypt.compare(password, user.administratorPassword)
        }

        // Determine specific error message
        if (!emailExists && !passwordValid) {
            console.log('Both email and password are invalid for:', email)
            return res.status(401).json({ message: 'Invalid email and password' })
        } else if (!emailExists) {
            console.log('Invalid email:', email)
            return res.status(401).json({ message: 'Invalid email' })
        } else if (!passwordValid) {
            console.log('Invalid password for email:', email)
            return res.status(401).json({ message: 'Invalid password' })
        }

        // If we reach here, both email and password are valid
        // Generate a JWT token
        const token = jwt.sign(
            { id: user.administratorID, email: user.administratorEmail },
            JWT_SECRET,
            { expiresIn: '720h' }, // Token expires in 720 hours
        )

        // Exclude the hashed password from the user object sent to the client
        const { administratorPassword, ...userWithoutPassword } = user

        // Return the token and sanitized user info
        res.json({ message: 'Login successful', token, user: userWithoutPassword })
    } catch (error) {
        // Catch any errors from database operations or bcrypt
        console.error('Login error:', error)
        res.status(500).json({ message: 'An unexpected error occurred during login.' })
    }
}

console.log(NODE_ENV)
