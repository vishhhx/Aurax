import {app}  from "./app"
import {connectMongoDb} from "@repo/database"
import { ENV } from "./config/env"
import logger from "./config/logger"


const startServer=async()=>{
    await connectMongoDb()
    logger.info("Connected to MongoDB")
    const port=ENV.PORT
    app.listen(port,()=>{
        logger.info(`Auth service is running on port ${port}`)
    })
}

startServer()