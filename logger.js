import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Try multiple log file locations
const logFile1 = path.join(__dirname, 'app.log')
const logFile2 = path.join(process.cwd(), 'app.log')
const logFile3 = './app.log'

// Create log function
export const log = (message, type = 'INFO') => {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${type}: ${message}\n`

    // Try to write to multiple locations
    const logFiles = [logFile1, logFile2, logFile3]
    let written = false

    for (const logFile of logFiles) {
        try {
            fs.appendFileSync(logFile, logMessage)
            written = true
            break
        } catch (error) {
            // Continue to next location
        }
    }

    if (!written) {
        // If all file writes fail, try creating a debug.log in current directory
        try {
            fs.appendFileSync('debug.log', `${timestamp} - FALLBACK LOG: ${message}\n`)
        } catch (error) {
            // Last resort - just console
        }
    }

    // Also console log (in case it works)
    console.log(logMessage.trim())
}

// Export error logging
export const logError = (message, error = null) => {
    const errorMessage = error ? `${message}: ${error.message}` : message
    log(errorMessage, 'ERROR')
}

// Export info logging
export const logInfo = message => {
    log(message, 'INFO')
}
