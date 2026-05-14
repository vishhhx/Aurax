import {asyncHandler,ApiReponse,ApiError} from "@repo/core/rest";
import {Request,Response} from "express"
import logger from "../config/logger";

export const register=asyncHandler(async(req:Request,res:Response)=>{


    const {email,password}=req.body

    
    



})