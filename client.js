const { Kafka } = require("kafkajs");
exports.kafka = new Kafka({
  brokers: ["192.168.1.5:9092"],
  clientId: "polling-system",
});
