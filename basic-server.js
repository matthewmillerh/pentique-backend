const express = require('express')
const cors = require('cors')

const app = express()

// Simple test
console.log('=== BASIC SERVER START ===')
console.log('Node version:', process.version)

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
    res.send('<h1>✅ Basic Server Running!</h1><p>Time: ' + new Date().toISOString() + '</p>')
})

app.get('/test', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        node: process.version,
    })
})

const PORT = process.env.PORT || 5000
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`)
})

module.exports = app
