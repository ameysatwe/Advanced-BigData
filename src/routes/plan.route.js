import express from "express";
import { redisClient } from "../service/redisClient.js";
import Ajv from "ajv";

const ajv = new Ajv({ allErrors: true });

const planRouter = express.Router();
const client = redisClient;
const jsonSchema = {};
planRouter.get("/", (req, res) => {});

planRouter.post("/", async (req, res) => {
  if (
    !req.body ||
    req.get("Content-length") == 0 ||
    !req.body["objectId"] ||
    ajv.validate(req.body, jsonSchema) == false
  ) {
    return res.status(400).send("Bad request");
  }
  client.set(req.body["objectId"], JSON.stringify(req.body), (err, reply) => {
    if (err) {
      return res.status(500).send("Internal Server Error");
    }
  });
  const response = await client.get(req.body["objectId"]);
  res.set("Etag", response);
  return res.status(201).send(req.body);
});

export default planRouter;
