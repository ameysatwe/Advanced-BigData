import { redisClient as client } from "../service/redisClient.js";

export const storePlanGraph = async (data) => {
  const parentKey = `${data.objectType}:${data.objectId}`;
  let newObj = {};
  for (let [key, value] of Object.entries(data)) {
    if (typeof value == "object" && !Array.isArray(value)) {
      const newKey = `${parentKey}:${key}`;
      const res = await storePlanGraph(value);
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
        arr.push(await storePlanGraph(value[i]));
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

export const retrievePlanGraph = async (parentKey) => {
  let response = await client.get(parentKey);
  if (response == null) return null;
  let data = JSON.parse(response);
  // console.log("Data = ",data+"\n")
  let newObj = {};
  if (typeof data == "string") {
    if (data.split(":").length > 1) {
      return retrievePlanGraph(data);
    }
  } else if (Array.isArray(data)) {
    let arr = [];
    for (let i = 0; i < data.length; i++) {
      if (data[i].split(":").length > 1) {
        const res = await retrievePlanGraph(data[i]);
        arr.push(res);
      }
      // const res= await retrievePlanGraph(data[i]);
      // arr.push(res);
    }
    return arr;
  }
  for (let [key, value] of Object.entries(data)) {
    if (typeof value == "string") {
      value.split(":").length > 1
        ? (newObj[key] = await retrievePlanGraph(value))
        : (newObj[key] = value);
    } else if (Array.isArray(value)) {
      let arr = [];
      for (let i = 0; i < value.length; i++) {
        const res = await retrievePlanGraph(value[i]);
        arr.push(res);
      }
      newObj[key] = arr;
    } else {
      newObj[key] = value;
    }
  }
  return newObj;
};

export const deletePlanGraph = async (parentKey) => {
  const res = await client.get(parentKey);
  const data = JSON.parse(res);
  // console.log(`${parentKey} = ${data}`)
  if (data == null) return;
  if (typeof data == "string") {
    if (data.split(":").length > 1) {
      await deletePlanGraph(data);
    }
    // return ;
  } else if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      if (data[i].split(":").length > 1) {
        await deletePlanGraph(data[i]);
      }
    }
    // return ;
  } else {
    for (let [key, value] of Object.entries(data)) {
      if (typeof value == "string") {
        if (value.split(":").length > 1) {
          await deletePlanGraph(value);
        }
      } else if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          await deletePlanGraph(value[i]);
        }
      }
    }
  }
  // if(await client.exists(parentKey) == 1){
  await client.del(parentKey);
  // }
  // await client.del(parentKey);
};
