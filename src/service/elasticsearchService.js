import { client } from "./elasticServiceConnection.js";

const INDEX_NAME = "plangraph";

/* ------------------------------------------------------------------
   Helper: Create ES join metadata based on node type
------------------------------------------------------------------- */
const createJoinField = (objectName, parentId, parentObjId) => {
  if (objectName === "plan") {
    return { parent: "", name: "plan" };
  }

  // Numeric child → linkedPlanServices
  if (/^-?\d+$/.test(objectName)) {
    return { parent: parentObjId, name: "linkedPlanServices" };
  }

  return { parent: parentId, name: objectName };
};

/* ------------------------------------------------------------------
   Recursive: Flatten nested objects into ES documents
------------------------------------------------------------------- */
const extractDocuments = (
  node,
  parentId = "",
  objectName = "plan",
  parentObjId = ""
) => {
  const docs = [];
  const { objectId, objectType, ...rest } = node;

  if (!objectId || !objectType) return docs;

  const docId = `${parentId}:${objectId}`;
  const document = {
    ...rest,
    plan_join: createJoinField(objectName, parentId, parentObjId),
  };

  docs.push({
    id: objectId,
    routing: parentId,
    body: document,
  });

  // Recursively process children
  for (const [key, value] of Object.entries(rest)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        docs.push(...extractDocuments(item, objectId, key, objectId));
      });
    } else if (typeof value === "object" && value !== null) {
      docs.push(...extractDocuments(value, objectId, key, objectId));
    }
  }

  return docs;
};

/* ------------------------------------------------------------------
   POST: Bulk index all ES documents derived from the plan
------------------------------------------------------------------- */
const postDocument = async (plan) => {
  try {
    const docs = extractDocuments(plan, "", "plan", plan.objectId);

    const operations = docs.flatMap((doc) => [
      { index: { _index: INDEX_NAME, _id: doc.id, routing: doc.routing } },
      doc.body,
    ]);

    await client.bulk({ refresh: true, body: operations });

    return { message: "Document has been posted", status: 200 };
  } catch (err) {
    console.error("Error posting document:", err);
    return { message: "Document has not been posted", status: 500 };
  }
};

/* ------------------------------------------------------------------
   DELETE: Remove all documents belonging to the plan
------------------------------------------------------------------- */
const collectKeys = (node) => {
  const keys = [];

  if (node.objectId) keys.push(node.objectId);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      value.forEach((child) => keys.push(...collectKeys(child)));
    } else if (typeof value === "object" && value !== null) {
      keys.push(...collectKeys(value));
    }
  }

  return keys;
};

const deleteDocument = async (jsonObject) => {
  try {
    const keys = collectKeys(jsonObject);

    const operations = keys.map((key) =>
      client
        .delete({
          index: INDEX_NAME,
          id: key,
        })
        .catch((e) => console.error("Delete error:", e.message))
    );

    await Promise.all(operations);

    console.log("Deleted keys:", keys);
    return { status: 200, message: "Documents deleted" };
  } catch (err) {
    console.error("Delete failed:", err);
    return { status: 500, message: "Delete error" };
  }
};

export { postDocument, deleteDocument };
