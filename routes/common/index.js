const express = require('express')
const router = express.Router()
const bookRoutes = require('./bookRoute')
const cardRoutes = require('./cardRoute')

router.use('/books', bookRoutes)
router.use('/', cardRoutes)

module.exports = router
