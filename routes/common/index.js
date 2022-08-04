const express = require('express')
const router = express.Router()
const cardRoutes = require('./cardRoute')

router.use('/', cardRoutes)

module.exports = router
