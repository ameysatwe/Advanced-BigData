import express from "express";
import planRouter from "./src/routes/plan.route.js";

import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());
// console.log(pro)

app.use(`/api/${process.env.VERSION}/plan`, planRouter);

app.listen(3000, () => console.log("Server started at port 3000"));
