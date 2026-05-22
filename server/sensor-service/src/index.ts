import express from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

import { connectMongo } from "./config/db.js";
import { SensorKernel } from "./kernel/sensorKernel.js";
import { TemperatureModule } from "./modules/TemperatureModule.js";
import { PeopleCountModule } from "./modules/PeopleCountModule.js";
import { AirQualityModule } from "./modules/AirQualityModule.js";
import { createIngestionHandler } from "./controllers/ingestionController.js";
import { createRouter } from "./router.js";
import { connectRedis } from "./config/redis.js";

export const app = express();
const PORT = process.env.PORT ?? 3000;

const kernel = new SensorKernel()
  .register(new TemperatureModule())
  .register(new PeopleCountModule())
  .register(new AirQualityModule());


export const getClientUrl = () =>
  process.env.CLIENT_URL ?? "http://localhost:8080";

app.use(express.json());

const ingestionHandler = createIngestionHandler(kernel);
app.use("/", createRouter(ingestionHandler, kernel));

const swaggerDocument = YAML.load("./openapi.yaml") as object;
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

if (process.env.NODE_ENV !== "test") {
  Promise.all([connectMongo(), connectRedis()])
    .then(() => {
      app.listen(PORT, () => {
        console.info(`[sensor-service] Listening on port ${String(PORT)}`);
        console.info(
          `[sensor-service] Registered sensor types: [${kernel.getRegisteredTypes().join(", ")}]`,
        );
      });
    })
    .catch((err: unknown) => {
      console.error("[sensor-service] Failed to start:", err);
      process.exit(1);
    });
}
