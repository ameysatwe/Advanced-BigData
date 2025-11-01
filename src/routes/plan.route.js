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

planRouter.put("/plan/:id", verifyToken, async (req, res) => {
  if (
    req._body == false ||
    req.get("Content-length") == 0 ||
    !req.body["objectId"] ||
    ajv.validate(dataSchema, req.body) == false
  ) {
    return res.status(400).send("Bad Request");
  }
  const response = await client.get(req.params.id);
  if (response == null) {
    return res.status(404).send("Not Found");
  }

  const etagRes = etag(JSON.stringify(resp));

  if (req.get("If-Match") !== etagRes) {
    return res.status(412).send("Precondition Failed");
  }

  client.set(req.params.id, JSON.stringify(req.body), (err, reply) => {
    if (err) {
      return res.status(500).send();
    }
  });
  res.set("Etag", etagRes);
  return res.status(200).send(req.body);
});

planRouter.patch("/plan/:id", verifyToken, async (req, res) => {
  if (
    req._body == false ||
    req.get("Content-length") == 0 ||
    !req.body["objectId"] ||
    ajv.validate(dataSchema, req.body) == false
  ) {
    return res.status(400).send("Bad Request");
  }
  const response = await client.get(req.params.id);
  if (response == null) {
    return res.status(404).send("Not Found");
  }
  const etagRes = etag(JSON.stringify(response));
  if (req.get("If-Match") !== etagRes) {
    return res.status(412).send("Precondition Failed");
  }

  const oldResponse = JSON.parse(response);
  // const newResponse = {...oldResponse, ...req.body};

  for (let [key, value] of Object.entries(req.body)) {
    if (dataSchema.properties[key].type == "array") {
      const oldArray = oldResponse[key];
      const newArray = value;
      for (let i = 0; i < newArray.length; i++) {
        const oldData = oldArray.filter(
          (item) => item.objectId == newArray[i].objectId
        );
        if (oldData.length == 0) {
          oldArray.push(newArray[i]);
        } else {
          oldArray[oldArray.indexOf(oldData[0])] = newArray[i];
        }
      }
    } else {
      oldResponse[key] = value;
    }
  }
  client.set(req.params.id, JSON.stringify(oldResponse), (err, reply) => {
    if (err) {
      return res.status(500).send();
    }
  });
  // const etagRes = etagCreater(JSON.stringify(oldResponse));
  const oldEtagRes = etag(JSON.stringify(oldResponse));
  res.set("Etag", oldEtagRes);
  return res.status(201).send(oldResponse);
});

export default planRouter;
