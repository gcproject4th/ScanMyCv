import mongoose from "mongoose";
import {ENV} from "./ENV.js";

const connectDB = async () => {
    try {
       await mongoose.connect(ENV.mongoUrl);
        // console.log('MongoDB connected');
    } catch (error) {
        console.log('Error in DB connection', error);
    }
}

export default connectDB;