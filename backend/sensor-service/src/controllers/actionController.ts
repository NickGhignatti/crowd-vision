import type { Request, Response } from "express";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SensorKernel } from "../kernel/sensorKernel.js";

/** The single downstream API call to perform for a given (action, sensor) pair. */
interface ActionEndpoint {
  url: string;
  method?: string;
  /** Maps a positional `actionArguments` index to this API's field name, e.g. `{"0":"value"}` -> `{ value: actionArguments[0] }`. */
  arguments?: Record<string, string>;
}

/** Action routing table: actionName -> sensorId -> endpoint. Extend by editing `actions.json`, not this file. */
type ActionsConfig = Record<string, Record<string, ActionEndpoint>>;

// `actions.json` lives at the package root, two levels up from this file (dev or built).
// Resolved via the module URL so it works regardless of cwd.
const ACTIONS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../actions.json",
);

/** Reads and parses `actions.json`; done per-request so edits apply without a restart. */
async function loadActions(): Promise<ActionsConfig> {
  const raw = await readFile(ACTIONS_PATH, "utf-8");
  return JSON.parse(raw) as ActionsConfig;
}

/** Maps positional args to field names: `{"0":"value"}` + `["21"]` -> `{ value: "21" }`. */
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
        "[actionController] Request to %s failed for action='%s' sensor='%s':",
        endpoint.url,
        actionName,
        sensorId,
        err,
      );
      res.status(502).json({ error: "Downstream endpoint is unreachable." });
      return;
    }

    res.status(200).json({ accepted: true, actionName, sensorId });
  };
}
