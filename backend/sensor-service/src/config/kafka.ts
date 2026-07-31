import { Kafka } from "kafkajs";

export const BUILDING_REGISTRATION_REQUESTED_TOPIC =
  "building-registration-requested";
export const BUILDING_REGISTRATION_COMPLETED_TOPIC =
  "building-registration-completed";

const kafka = new Kafka({
  clientId: "sensor-service",
  brokers: (process.env.KAFKA_BROKERS ?? "localhost:9092").split(","),
});

export const registrationProducer = kafka.producer();
export const registrationConsumer = kafka.consumer({
  groupId: "sensor-service-registration",
});

// Auto-created topics are lazy: a subscribe/produce against a topic nobody
// has ever touched can race the broker's own creation of it and fail with
// UNKNOWN_TOPIC_OR_PARTITION before it exists. Create both explicitly and
// idempotently before anything subscribes or sends.
const ensureTopics = async () => {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: [
        { topic: BUILDING_REGISTRATION_REQUESTED_TOPIC },
        { topic: BUILDING_REGISTRATION_COMPLETED_TOPIC },
      ],
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
};

export const connectKafka = async () => {
  await ensureTopics();
  await Promise.all([
    registrationProducer.connect(),
    registrationConsumer.connect(),
  ]);
};
