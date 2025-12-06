import express from "express";
import { redisClient } from "../service/redisClient.js";
import Ajv from "ajv";
import etag from "etag";
import verifyToken from "../middlewares/auth.js";

import sender from "../pubsub/sender.js";
import rabbit from "../service/rabbitmq.service.js";

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
const flattenKeys = async (data) => {
  const parentKey = `${data.objectType}:${data.objectId}`;
  let newObj = {};
  for (let [key, value] of Object.entries(data)) {
    if (typeof value == "object" && !Array.isArray(value)) {
      const newKey = `${parentKey}:${key}`;
      const res = await flattenKeys(value);
      await client.set(newKey, JSON.stringify(res), (err, reply) => {
        if (err) {
          return res.status(500).send();
        }
      });
      newObj[key] = newKey;
    } else if (Array.isArray(value)) {
      // console.log(key + ' is an array')
      let arr = [];
      for (let i = 0; i < value.length; i++) {
        arr.push(await flattenKeys(value[i]));
      }
      const newKey = `${parentKey}:${key}`;
      await client.set(newKey, JSON.stringify(arr), (err, reply) => {
        if (err) {
          return res.status(500).send();
        }
      });
      newObj[key] = newKey;
    } else {
      // console.log("remamining keys of the parent which are neither object nor array \n"+key+"\n")
      newObj[key] = value;
    }
  }
  // console.log(parentKey," = ",newObj)
  await client.set(parentKey, JSON.stringify(newObj), (err, reply) => {
    if (err) {
      return res.status(500).send();
    }
  });
  return parentKey;
};

const unflattenKeys = async (parentKey) => {
  let response = await client.get(parentKey);
  if (response == null) return null;
  let data = JSON.parse(response);
  // console.log("Data = ",data+"\n")
  let newObj = {};
  if (typeof data == "string") {
    if (data.split(":").length > 1) {
      return unflattenKeys(data);
    }
  } else if (Array.isArray(data)) {
    let arr = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].split(":").length > 1) {
        const res = await unflattenKeys(data[i]);
        arr.push(res);
      }
      // const res= await unflattenKeys(data[i]);
      // arr.push(res);
    }
    return arr;
  }
  for (let [key, value] of Object.entries(data)) {
    if (typeof value == "string") {
      value.split(":").length > 1
        ? (newObj[key] = await unflattenKeys(value))
        : (newObj[key] = value);
    } else if (Array.isArray(value)) {
      let arr = [];
      for (let i = 0; i < value.length; i++) {
        const res = await unflattenKeys(value[i]);
        arr.push(res);
      }
      newObj[key] = arr;
    } else {
      newObj[key] = value;
    }
  }
  return newObj;
};

const deleteAllKeys = async (parentKey) => {
  const res = await client.get(parentKey);
  const data = JSON.parse(res);
  // console.log(`${parentKey} = ${data}`)
  if (data == null) return;
  if (typeof data == "string") {
    if (data.split(":").length > 1) {
      await deleteAllKeys(data);
    }
    // return ;
  } else if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].split(":").length > 1) {
        await deleteAllKeys(data[i]);
      }
    }
    // return ;
  } else {
    for (let [key, value] of Object.entries(data)) {
      if (typeof value == "string") {
        if (value.split(":").length > 1) {
          await deleteAllKeys(value);
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          await deleteAllKeys(value[i]);
        }
      }
    }
  }
  // if(await client.exists(parentKey) == 1){
  await client.del(parentKey);
  // }
  // await client.del(parentKey);
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

  // constke = req.body["objectId"];

  const key = `plan:${req.body.objectId}`;

  try {
    // Check if key already exists
    const exists = await client.exists(key);
    if (exists) {
      return res.status(409).send("Conflict: object already exists");
    }

    // Store data
    // await client.set(key, JSON.stringify(req.body));

    await flattenKeys(req.body);

    const response = await client.get(key);
    res.set("ETag", etag(JSON.stringify(response)));
    const message = { operation: "STORE", body: req.body };
    rabbit.producer(message);
    return res.status(201).send(req.body);
  } catch (err) {
    console.error("Redis error:", err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.get("/:id", verifyToken, async (req, res) => {
  try {
    const key = `plan:${req.params.id}`;
    const resp = await unflattenKeys(key);
    if (resp == null) {
      return res.status(404).send("Not Found");
    }
    const etagRes = etag(JSON.stringify(resp));
    if (req.get("If-None-Match") && etagRes == req.get("If-None-Match")) {
      return res.status(304).send();
    }
    res.set("Etag", etagRes);
    return res.status(200).send(resp);
  } catch (err) {
    console.log(err);
    return res.status(500).send("Internal Server Error");
  }
});

planRouter.delete("/:id", verifyToken, async (req, res) => {
  try {
    const key = `plan:${req.params.id}`;
    if ((await client.exists(key)) === 0) {
      return res.status(404).send("Not Found");
    }
    const clientData = await unflattenKeys(key);
    await deleteAllKeys(key);

    const message = { operation: "DELETE", body: clientData };
    rabbit.producer(message);
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

    const currentEtag = etag(JSON.stringify(existing));
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
    const currentEtag = etag(JSON.stringify(existing));
    console.log(currentEtag);

    if (req.get("If-Match") && req.get("If-Match") !== currentEtag) {
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
    rabbit.producer({ operation: "STORE", body: oldResponse });
    return res.status(200).json(oldResponse);
  } catch (err) {
    console.error(err);
    return res.status(500).send("Internal Server Error");
  }
});

export default planRouter;
