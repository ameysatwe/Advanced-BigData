import express from "express";
import planRouter from "./src/routes/plan.route.js";

const app = express();
app.use(express.json());

app.use("/api/plan/v1", planRouter);

app.listen(3000, () => console.log("Server started at port 3000"));
