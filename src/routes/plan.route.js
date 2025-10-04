import express from "express";
import { redisClient } from "../service/redisClient.js";
import Ajv from "ajv";
import etag from "etag";

const ajv = new Ajv();

const planRouter = express.Router();
const client = redisClient;
const jsonSchema = {
  type: "object",
  properties: {
    planCostShares: {
      type: "object",
      properties: {
        deductible: { type: "number" },
        _org: { type: "string", const: "example.com" },
        copay: { type: "number" },
        objectId: { type: "string" },
        objectType: { type: "string", const: "membercostshare" },
      },
      required: ["deductible", "_org", "copay", "objectId", "objectType"],
    },
    linkedPlanServices: {
      type: "array",
      items: {
        type: "object",
        properties: {
          linkedService: {
            type: "object",
            properties: {
              _org: { type: "string", const: "example.com" },
              objectId: { type: "string" },
              objectType: { type: "string", const: "service" },
              name: { type: "string" },
            },
            required: ["_org", "objectId", "objectType", "name"],
          },
          planserviceCostShares: {
            type: "object",
            properties: {
              deductible: { type: "number" },
              _org: { type: "string", const: "example.com" },
              copay: { type: "number" },
              objectId: { type: "string" },
              objectType: { type: "string", const: "membercostshare" },
            },
            required: ["deductible", "_org", "copay", "objectId", "objectType"],
          },
          _org: { type: "string", const: "example.com" },
          objectId: { type: "string" },
          objectType: { type: "string", const: "planservice" },
        },
        required: [
          "linkedService",
          "planserviceCostShares",
          "_org",
          "objectId",
          "objectType",
        ],
      },
    },
    _org: { type: "string", const: "example.com" },
    objectId: { type: "string" },
    objectType: { type: "string", const: "plan" },
    planType: { type: "string", const: "inNetwork" },
    creationDate: { type: "string" },
  },
  required: [
    "planCostShares",
    "_org",
    "objectId",
    "objectType",
    "planType",
    "creationDate",
  ],
};
planRouter.post("/", async (req, res) => {
  if (
    !req.body ||
    req.get("Content-length") == 0 ||
    !req.body["objectId"] ||
    ajv.validate(jsonSchema, req.body) == false
  ) {
    return res.status(400).send("Bad request");
  }
  client.set(req.body["objectId"], JSON.stringify(req.body), (err, reply) => {
    if (err) {
      return res.status(500).send("Internal Server Error");
    }
  });
  const response = await client.get(req.body["objectId"]);
  res.set("Etag", etag(JSON.stringify(response)));
  return res.status(201).send(req.body);
});

planRouter.get("/:id", async (req, res) => {
  try {
    const resp = await client.get(req.params.id);
    // console.log(resp);
    if (resp == null) {
      return res.status(404).send("Not Found");
    }
    const etagRes = etag(JSON.stringify(resp));
    if (
      req.get("If-None-Match") &&
      etagRes.toString() == req.get("If-None-Match")
    ) {
      console.log("here");
      return res.status(304).send();
    }
    res.set("Etag", etagRes);
    return res.status(200).send(JSON.parse(resp));
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.delete("/:id", async (req, res) => {
  try {
    const resp = await client.del(req.params.id);
    if (resp === 0) {
      return res.status(404).send("Not Found");
    }
    return res.status(204).send();
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
});

export default planRouter;
