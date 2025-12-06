import amqp from "amqplib";
import { postDocument, deleteDocument } from "./elasticsearch.service.js";
const QUEUE = "PUBSUB";
const reciever = () => {
  console.log("reciever running");
  amqp.connect("amqp://localhost", function (error0, connection) {
    if (error0) {
      throw error0;
    }
    connection.createChannel(async function (error1, channel) {
      if (error1) {
        throw error1;
      }
      channel.assertQueue(QUEUE, {
        durable: false,
      });
      console.log(
        " [*] Waiting for messages in %s. To exit press CTRL+C",
        QUEUE
      );
      channel.consume(
        QUEUE,
        async function (msg) {
          console.log(" [x] Received  message from queue ");
          const { operation, body } = JSON.parse(msg.content.toString());
          const planObject = body;
          if (operation === "POST") {
            const elasticResponse = await postDocument(planObject);
            if (elasticResponse.status === 200) {
              console.log("Document has been posted");
              channel.ack(msg);
              channel.checkQueue(QUEUE, function (err, ok) {
                console.log(ok.messageCount);
              });
            }
          } else if (operation === "DELETE") {
            const elasticResponse = await deleteDocument(planObject);
            if (elasticResponse.status === 200) {
              console.log("Document has been posted");
              channel.ack(msg);
              channel.checkQueue(QUEUE, function (err, ok) {
                console.log(ok.messageCount);
              });
            }
          }
        },
        {
          noAck: false,
        }
      );
    });
  });
};

export default reciever;
