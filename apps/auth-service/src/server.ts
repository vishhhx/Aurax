import {app}  from "./app"
import {connectMongoDb} from "@repo/database"
import { ENV } from "./config/env"


const startServer=async()=>{
    await connectMongoDb()
    const port=ENV.PORT
    app.listen(port,()=>{
        console.log(`Auth service is running on port ${port}`)
    })
}

startServer()