import express from "express"
import cors from "cors"
import Router from "./routes/routes.js"

//init express
const app = express()

//use express json
app.use(express.json())

//use cors
// Configure CORS to allow requests from all origins
app.use(cors({ 
  origin: "*", 
  methods: ["GET", "POST", "PUT", "DELETE"], 
  allowedHeaders: ["Content-Type", "Authorization"] 
}))

//use router
app.use(Router)

//PORT
app.listen(5000, () => {
  console.log("Server running successfully ")
});