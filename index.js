import express from 'express'
import cors from 'cors'
import Router from './routes/routes.js'
import multer from 'multer'
import path from 'path'
import { log, logError, logInfo } from './logger.js'

// Test logging immediately
logInfo('=== SERVER STARTING ===')
logInfo(`Node version: ${process.version}`)
logInfo(`Environment: ${process.env.NODE_ENV || 'none'}`)
logInfo(`Current working directory: ${process.cwd()}`)
logInfo(`__dirname equivalent: ${path.dirname(new URL(import.meta.url).pathname)}`)

// Multer setup for file uploads
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, 'uploads/')
    },
    filename: (_req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname))
    },
})

// If you need 'upload' later, you can uncomment the next line
// const upload = multer({ storage })

//init express
const app = express()
logInfo('Express app initialized')

//use express json
app.use(express.json())
logInfo('Express JSON middleware added')

// Serve images from the correct directory structure
app.use('/images', express.static('images'))
logInfo('Static images middleware added')

//use cors
// Configure CORS to allow requests from all origins
app.use(
    cors({
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }),
)
logInfo('CORS middleware added')

//use router
app.use(Router)
logInfo('Router middleware added')

// Test route to check if server is working
app.get('/test', (req, res) => {
    logInfo('Test route accessed')
    res.send(`
        <!DOCTYPE html>
        <html>
        <head><title>Server Test</title></head>
        <body>
            <h1>✅ Server is Running!</h1>
            <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            <p><strong>Node Version:</strong> ${process.version}</p>
            <p><strong>Working Directory:</strong> ${process.cwd()}</p>
            <p><strong>Port:</strong> ${process.env.PORT || 5000}</p>
        </body>
        </html>
    `)
})

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: Date.now() })
})

// Root endpoint
app.get('/', (req, res) => {
    res.send('<h1>API Server Running</h1><p><a href="/test">Test Page</a></p>')
})

//PORT
const PORT = process.env.PORT || 5000
logInfo(`Starting server on port ${PORT}`)
app.listen(PORT, () => {
    logInfo(`Server running successfully on port ${PORT}`)
}).on('error', err => {
    logError('Server failed to start', err)
})
