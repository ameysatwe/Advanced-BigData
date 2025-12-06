import amqp from "amqplib";
import { postDocument, deleteDocument } from "./elasticsearch.service.js";

const QUEUE = "PUBSUB";

const receiver = async () => {
  console.log("Receiver running...");

  try {
    const connection = await amqp.connect("amqp://localhost");
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE, { durable: false });

    console.log(`[*] Waiting for messages in ${QUEUE}. Press CTRL+C to exit`);

    channel.consume(
      QUEUE,
      async (msg) => {
        console.log(" [x] Received message from queue");

        const { operation, body } = JSON.parse(msg.content.toString());

        try {
          if (operation === "STORE") {
            const esResp = await postDocument(body);

            if (esResp.status === 200) {
              console.log("Document indexed successfully (STORE)");
              channel.ack(msg);
            }
          } else if (operation === "DELETE") {
            const esResp = await deleteDocument(body);

            if (esResp.status === 200) {
              console.log("Document deleted successfully (DELETE)");
              channel.ack(msg);
            }
          }

          const queueStatus = await channel.checkQueue(QUEUE);
          console.log("Remaining messages:", queueStatus.messageCount);
        } catch (err) {
          console.error("Error processing message:", err);
        }
      },
      { noAck: false }
    );
  } catch (err) {
    console.error("RabbitMQ connection error:", err);
  }
};

export default receiver;
