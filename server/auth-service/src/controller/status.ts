import type { Request, Response } from "express";

export const checkHealth = (_req: Request, res: Response) => {
  res.status(200).send();
}