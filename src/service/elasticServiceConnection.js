import { Client } from "@elastic/elasticsearch";
export const client = new Client({
  node: "http://localhost:9200",
  log: "trace",
});

export const elasticServiceConnection = async () => {
  try {
    const res = await client.info();
    console.log("Elasticsearch is running");
    return new Promise((resolve, reject) => {
      resolve({
        message: "Elasticsearch is running",
        client: client,
        status: 200,
      });
    });
  } catch (e) {
    console.log(e);
    return new Promise((resolve, reject) => {
      resolve({
        message: "Elasticsearch is not running",
        client: client,
        status: 500,
      });
    });
  }
};
