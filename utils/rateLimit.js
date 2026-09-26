// Stops one visitor sending the same form over and over (spam bots, a stuck button). Counts are kept in memory per
// IP address, so they start again when the server restarts, which is fine for this.
export const rateLimit = ({ max, windowMs, message }) => {
    const hits = new Map() // ip -> { count, resetAt }

    // forget visitors whose time is up, so the map can not grow forever
    setInterval(() => {
        const now = Date.now()
        for (const [ip, entry] of hits) if (entry.resetAt <= now) hits.delete(ip)
    }, windowMs).unref()

    return (req, res, next) => {
        const now = Date.now()
        const ip = req.ip || 'unknown'
        let entry = hits.get(ip)
        if (!entry || entry.resetAt <= now) {
            entry = { count: 0, resetAt: now + windowMs }
            hits.set(ip, entry)
        }
        entry.count += 1
        if (entry.count > max) {
            res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000))
            return res.status(429).json({ message })
        }
        next()
    }
}
