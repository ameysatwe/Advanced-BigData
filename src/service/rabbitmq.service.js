import ampq from "amqplib";
import { postDocument, deleteDocument } from "./elasticsearch.service.js";

let config = {
  RABBITMQ_QUEUE_NAME: "PUBSUB",
  RABBITMQ_EXCHANGE_TYPE: "direct",
  RABBITMQ_EXCHANGE_NAME: "demo",
  RABBITMQ_KEY: "demo3",
  ELASTICSEARCH_INDEX_NAME: "planindex",
};
const QUEUE_NAME = config.RABBITMQ_QUEUE_NAME;
const EXCHANGE_TYPE = config.RABBITMQ_EXCHANGE_TYPE;
const EXCHANGE_NAME = config.RABBITMQ_EXCHANGE_NAME;
const KEY = config.RABBITMQ_KEY;

let channel;

(() => {
  const connection = ampq.connect("amqp://localhost");
  connection.then(async (conn) => {
    channel = await conn.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE);
    await channel.assertQueue(QUEUE_NAME);
    channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, KEY);
  });
})();

const producer = (content) => {
  channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(content)));
  setInterval(() => {
    consumer();
  }, 1000);
};

const consumer = async () => {
  return await channel.consume(QUEUE_NAME, async (message) => {
    const content = message.content.toString();
    await channel.ack(message);

    const { operation, body } = JSON.parse(content);

    if (operation === "STORE") {
      await postDocument(body);
    } else if (operation === "DELETE") {
      await deleteDocument(body);
    }
  });
};

export default {
  producer,
  consumer,
};
