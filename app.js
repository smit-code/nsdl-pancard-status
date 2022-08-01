require('dotenv').config()
require('./database/conn')
const express = require('express')
const app = express()
const PORT = process.env.PORT || 8000
const cors = require('cors')
const path = require("path")
const seed = require('./seeders/seed')
const routes = require('./routes/index')
const { errorHandler } = require('./utils/errorHandler')


const corsOptions = { origin: process.env.ALLOW_ORIGIN }
app.use(cors(corsOptions))

app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static('images'));

app.set('view engine', 'ejs')
app.set('views', 'views')

app.use(express.json())
app.use(express.urlencoded({ extended: false }))

app.use('/', routes)
seed.seedAdmin()
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
