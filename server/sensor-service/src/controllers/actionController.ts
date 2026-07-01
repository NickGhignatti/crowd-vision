import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SensorKernel } from "../kernel/sensorKernel.js";

/** The single downstream API call to perform for a given (action, sensor) pair. */
interface ActionEndpoint {
  url: string;
  method?: string;
  /**
   * Maps a positional index from the frontend's `actionArguments` to the field
   * name this particular API expects. Different sensors can name the same
   * positional argument differently.
   *
   * e.g. `{ "0": "value" }` means the request body will carry
   * `{ value: actionArguments[0] }`.
   */
  arguments?: Record<string, string>;
}

/**
 * The action routing table, shaped as:
 *   actionName -> sensorId -> endpoint to call.
 *
 * To support a new sensor (or a new action) you only edit `actions.json`:
 * add the sensor id under the relevant action, point it at the API endpoint,
 * and describe how the positional arguments map to that API's field names.
 */
type ActionsConfig = Record<string, Record<string, ActionEndpoint>>;

// `actions.json` lives at the sensor-service package root, two levels up from
// this file whether it runs from `src/controllers` (dev) or `dist/controllers`
// (build). Resolving against the module URL keeps it independent of the cwd.
const ACTIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../actions.json",
);

/**
 * Reads and parses the action routing table from `actions.json`.
 * Read on every request so edits to the file take effect without a restart.
 */
async function loadActions(): Promise<ActionsConfig> {
  const raw = await readFile(ACTIONS_PATH, "utf-8");
  return JSON.parse(raw) as ActionsConfig;
}

/**
 * Builds the request body by mapping each positional frontend argument to the
 * field name the endpoint declares. `{ "0": "value" }` + `["21"]` -> `{ value: "21" }`.
 */
function mapArguments(
  mapping: Record<string, string> | undefined,
  args: unknown[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [index, name] of Object.entries(mapping ?? {})) {
    body[name] = args[Number(index)];
  }
  return body;
}

export function createActionHandler(_kernel: SensorKernel) {
  return async function execute(req: Request, res: Response): Promise<void> {
    const { actionData } = req.body ?? {};

    if (!actionData || typeof actionData !== "object") {
      res.status(400).json({ error: "Missing or invalid field: `actionData`." });
      return;
    }

    const { sensorId, actionName, actionArguments } = actionData as {
      sensorId?: unknown;
      actionName?: unknown;
      actionArguments?: unknown;
    };

    if (typeof actionName !== "string" || actionName.trim().length === 0) {
      res
        .status(400)
        .json({ error: "`actionName` must be a non-empty string." });
      return;
    }

    if (typeof sensorId !== "string" || sensorId.trim().length === 0) {
      res.status(400).json({ error: "`sensorId` must be a non-empty string." });
      return;
    }

    // ── Load the routing table ───────────────────────────────────────────────
    let actions: ActionsConfig;
    try {
      actions = await loadActions();
    } catch (err) {
      console.error("[actionController] Failed to load actions.json:", err);
      res.status(500).json({ error: "Action configuration is unavailable." });
      return;
    }

    // ── Match: action type → sensor id → endpoint ────────────────────────────
    const sensorsForAction = actions[actionName];
    if (!sensorsForAction) {
      res
        .status(404)
        .json({ error: `No action configured for '${actionName}'.` });
      return;
    }

    const endpoint = sensorsForAction[sensorId];
    if (!endpoint) {
      res.status(404).json({
        error: `No endpoint configured for sensor '${sensorId}' on action '${actionName}'.`,
      });
      return;
    }

    // ── Map the positional arguments to this endpoint's field names ──────────
    const args = Array.isArray(actionArguments) ? actionArguments : [];
    const body = mapArguments(endpoint.arguments, args);

    // ── Dispatch ─────────────────────────────────────────────────────────────
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method ?? "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        console.error(
          `[actionController] ${endpoint.url} responded ${response.status} ${response.statusText} for action='${actionName}' sensor='${sensorId}'.`,
        );
        res
          .status(502)
          .json({ error: "Downstream endpoint returned an error." });
        return;
      }
    } catch (err) {
      console.error(
        `[actionController] Request to ${endpoint.url} failed for action='${actionName}' sensor='${sensorId}':`,
        err,
      );
      res.status(502).json({ error: "Downstream endpoint is unreachable." });
      return;
    }

    res.status(200).json({ accepted: true, actionName, sensorId });
  };
}
