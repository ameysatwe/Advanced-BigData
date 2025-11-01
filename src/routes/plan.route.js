import express from "express";
import { redisClient } from "../service/redisClient.js";
import Ajv from "ajv";
import etag from "etag";
import verifyToken from "../middlewares/auth.js";

const ajv = new Ajv({ allErrors: true });

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
const validate = ajv.compile(jsonSchema);
planRouter.post("/", verifyToken, async (req, res) => {
  // Validate request
  if (
    !req.body ||
    req.get("Content-length") == 0 ||
    !req.body["objectId"] ||
    validate(req.body) == false
  ) {
    // console.log("Bad request");
    console.log(validate?.errors);
    return res.status(400).json(validate?.errors);
  }

  const key = req.body["objectId"];

  try {
    // Check if key already exists
    const exists = await client.exists(key);
    if (exists) {
      return res.status(409).send("Conflict: object already exists");
    }

    // Store data
    await client.set(key, JSON.stringify(req.body));

    const response = await client.get(key);
    res.set("ETag", etag(JSON.stringify(response)));
    return res.status(201).send(req.body);
  } catch (err) {
    console.error("Redis error:", err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.get("/:id", verifyToken, async (req, res) => {
  try {
    const resp = await client.get(req.params.id);
    if (resp == null) {
      return res.status(404).send("Not Found");
    }
    const etagRes = etag(JSON.stringify(resp));
    if (req.get("If-None-Match") && etagRes == req.get("If-None-Match")) {
      return res.status(304).send();
    }
    res.set("Etag", etagRes);
    return res.status(200).send(JSON.parse(resp));
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.delete("/:id", verifyToken, async (req, res) => {
  try {
    const resp = await client.del(req.params.id);
    if (resp === 0) {
      return res.status(404).send("Not Found");
    }
    // console.log("Deleted object ID " + req.params.id);
    return res.status(204).send();
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.put("/:id", verifyToken, async (req, res) => {
  if (!req.body || !req.body.objectId || !validate(req.body)) {
    return res.status(400).send("Bad Request");
  }

  try {
    console.log("here");
    const existing = await client.get(req.params.id);
    if (!existing) return res.status(404).send("Not Found");

    const currentEtag = etag(existing);
    if (req.get("If-Match") && req.get("If-Match") !== currentEtag) {
      return res.status(412).send("Precondition Failed");
    }

    await client.set(req.params.id, JSON.stringify(req.body));
    const newTag = etag(JSON.stringify(req.body));
    res.set("ETag", newTag);
    return res.status(200).send(req.body);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.patch("/:id", verifyToken, async (req, res) => {
  if (!req.body || typeof req.body !== "object") {
    return res.status(400).send("Bad Request");
  }

  try {
    const existing = await client.get(req.params.id);
    if (!existing) return res.status(404).send("Not Found");

    const oldResponse = JSON.parse(existing);
    const currentEtag = etag(existing);

    if (
      req.get("If-Match") &&
      req.get("If-Match") !== currentEtag &&
      req.get("If-Match").length != 0
    ) {
      return res.status(412).send("Precondition Failed");
    }
    for (const [key, newValue] of Object.entries(req.body)) {
      const schemaType = jsonSchema.properties[key]?.type;

      if (schemaType === "array") {
        const oldArray = oldResponse[key] || [];
        const newArray = newValue || [];

        newArray.forEach((newItem) => {
          const index = oldArray.findIndex(
            (oldItem) => oldItem.objectId === newItem.objectId
          );

          if (index === -1) {
            // Item not found → add new one
            oldArray.push(newItem);
          } else {
            // Item exists → replace with updated version
            oldArray[index] = newItem;
          }
        });

        oldResponse[key] = oldArray;
      } else {
        oldResponse[key] = newValue;
      }
    }

    if (!validate(oldResponse)) {
      return res.status(400).json(validate.errors);
    }

    await client.set(req.params.id, JSON.stringify(oldResponse));
    const newTag = etag(JSON.stringify(oldResponse));
    res.set("ETag", newTag);
    return res.status(200).json(oldResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});

export default planRouter;
