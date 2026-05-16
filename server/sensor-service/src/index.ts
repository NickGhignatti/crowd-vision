import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";

import { connectMongo } from "./config/db.js";
import { SensorKernel } from "./kernel/sensorKernel.js";
import { TemperatureModule } from "./modules/TemperatureModule.js";
import { PeopleCountModule } from "./modules/PeopleCountModule.js";
import { AirQualityModule } from "./modules/AirQualityModule.js";
import { createIngestionHandler } from "./controllers/ingestionController.js";
import { createRouter } from "./router.js";

export const app = express();
const PORT = process.env.PORT ?? 3000;

// ── Kernel composition ───────────────────────────────────────────────────────
//
// Modules are registered here at startup. If a type collision occurs (bug),
// SensorKernel.register() throws synchronously — crashing startup intentionally.
// An unknown sensor type at runtime is a 404, not a crash.
//
const kernel = new SensorKernel()
  .register(new TemperatureModule())
  .register(new PeopleCountModule())
  .register(new AirQualityModule());

// ── HTTP setup ───────────────────────────────────────────────────────────────

export const getClientUrl = () =>
  process.env.CLIENT_URL ?? "http://localhost:5173";

app.use(cors({ origin: getClientUrl(), credentials: true }));
app.use(express.json());

const ingestionHandler = createIngestionHandler(kernel);
app.use("/", createRouter(ingestionHandler, kernel));

const swaggerDocument = YAML.load("./openapi.yaml") as object;
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ── Bootstrap ────────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== "test") {
  connectMongo()
    .then(() => {
      app.listen(PORT, () => {
        console.info(`[sensor-service] Listening on port ${String(PORT)}`);
        console.info(
          `[sensor-service] Registered sensor types: [${kernel.getRegisteredTypes().join(", ")}]`,
        );
      });
    })
    .catch((err: unknown) => {
      console.error("[sensor-service] Failed to connect to MongoDB:", err);
      process.exit(1);
    });
}
