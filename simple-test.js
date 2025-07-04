console.log('=== SIMPLE TEST START ===')
console.log('Node version:', process.version)
console.log('Working directory:', process.cwd())
console.log('Environment:', process.env.NODE_ENV)
console.log('=== SIMPLE TEST END ===')

// Try to create a simple file
import fs from 'fs'
try {
    fs.writeFileSync('test-output.txt', `Test run at: ${new Date().toISOString()}`)
    console.log('✅ File created successfully')
} catch (error) {
    console.log('❌ File creation failed:', error.message)
}
