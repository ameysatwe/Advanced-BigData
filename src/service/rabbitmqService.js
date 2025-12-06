import amqp from "amqplib";
import { postDocument, deleteDocument } from "./elasticsearchService.js";
import dotenv from "dotenv";

dotenv.config();

const QUEUE_NAME = process.env.RABBITMQ_QUEUE_NAME;
const EXCHANGE_TYPE = process.env.RABBITMQ_EXCHANGE_TYPE;
const EXCHANGE_NAME = process.env.RABBITMQ_EXCHANGE_NAME;
const KEY = process.env.RABBITMQ_KEY;

let channel;
let connection;
let consumerStarted = false;

/* ------------------------ Initialization ------------------------ */

const init = async () => {
  try {
    connection = await amqp.connect({
      protocol: "amqp",
      hostname: "localhost",
      port: 5672,
      username: process.env.RABBITMQ_USERNAME,
      password: process.env.RABBITMQ_PASSWORD,
      vhost: "/",
    });
    channel = await connection.createChannel();

    await channel.assertExchange(EXCHANGE_NAME, EXCHANGE_TYPE);
    await channel.assertQueue(QUEUE_NAME);
    channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, KEY);

    console.log("RabbitMQ Producer/Consumer initialized");
  } catch (error) {
    console.error("RabbitMQ initialization failed:", error);
  }
};

// Call init ONCE when the module is loaded
init();

/* ----------------------------- Producer ----------------------------- */

const producer = (content) => {
  if (!channel) {
    console.error("RabbitMQ channel not initialized yet");
    return;
  }

  channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(content)));

  // Preserve your logic: consumer runs every second
  if (!consumerStarted) {
    consumerStarted = true;
    setInterval(() => {
      consumer();
    }, 1000);
  }
};

/* ----------------------------- Consumer ----------------------------- */

const consumer = async () => {
  if (!channel) return;

  return await channel.consume(
    QUEUE_NAME,
    async (message) => {
      if (!message) return;

      const msgContent = message.content.toString();
      channel.ack(message);

      const { operation, body } = JSON.parse(msgContent);

      try {
        if (operation === "STORE") {
          await postDocument(body);
        } else if (operation === "DELETE") {
          await deleteDocument(body);
        }
      } catch (error) {
        console.error("Error processing message:", error);
      }
    },
    { noAck: false }
  );
};

export default {
  producer,
  consumer,
};
