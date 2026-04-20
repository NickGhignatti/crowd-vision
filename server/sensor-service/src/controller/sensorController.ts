import type { Request, Response } from "express";
import {
  postPeopleCountSignal,
  postTemperatureSignal,
  getLatestsPeopleCountSignal,
  getLatestsTemperatureSignal,
  getAllLatestsPeopleCountSignal,
  getAllLatestsTemperatureSignal,
} from "../services/sensorService.js";
import {
  getTemperatureData,
  getPeopleCountData,
} from "../services/dashboardService.js";
import type {
  PeopleCountParams,
  DashboardPeopleCountParams,
  DashboardBuildingPeopleCountParams,
} from "../models/peopleCountSignal.js";
import type {
  TemperatureParams,
  DashboardTemperatureParams,
  DashboardBuildingTemperatureParams,
} from "../models/temperatureSignal.js";

export const postPeopleCount = async (req: Request, res: Response) => {
  try {
    const { buildingId, roomId, timestamp, peopleCount } = req.body;
    await postPeopleCountSignal(buildingId, roomId, timestamp, peopleCount);
    res.status(201).json({ message: "People count signal created" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const postTemperature = async (req: Request, res: Response) => {
  try {
    const { buildingId, roomId, timestamp, temperature } = req.body;
    await postTemperatureSignal(buildingId, roomId, timestamp, temperature);
    res.status(201).json({ message: "Temperature signal created" });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSinglePeopleCount = async (
  req: Request<PeopleCountParams>,
  res: Response,
) => {
  try {
    const { building, roomId } = req.query;
    const peopleCount = await getLatestsPeopleCountSignal(
      building as string,
      roomId as string,
    );
    res.status(200).json({ peopleCount });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getSingleTemperature = async (
  req: Request<TemperatureParams>,
  res: Response,
) => {
  try {
    const { building, roomId } = req.query;
    const temperature = await getLatestsTemperatureSignal(
      building as string,
      roomId as string,
    );
    res.status(200).json({ temperature });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllPeopleCount = async (
  req: Request<PeopleCountParams>,
  res: Response,
) => {
  try {
    const { building } = req.query;
    const peopleCount = await getAllLatestsPeopleCountSignal(
      building as string,
    );
    res.status(200).json({ peopleCount });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getAllTemperature = async (
  req: Request<TemperatureParams>,
  res: Response,
) => {
  try {
    const { building } = req.query;
    const temperature = await getAllLatestsTemperatureSignal(
      building as string,
    );
    res.status(200).json({ temperature });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getTemperatureDashboard = async (
  req: Request<DashboardTemperatureParams>,
  res: Response,
) => {
  try {
    const { building, roomId, timeRange } = req.query;
    const temperature = await getTemperatureData(
      building as string,
      timeRange as string,
      roomId as string,
    );
    res.status(200).json({ temperature });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getPeopleCountDashboard = async (
  req: Request<DashboardPeopleCountParams>,
  res: Response,
) => {
  try {
    const { building, roomId, timeRange } = req.query;
    const peopleCount = await getPeopleCountData(
      building as string,
      timeRange as string,
      roomId as string,
    );
    res.status(200).json({ peopleCount });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getEntireBuildingTemperatureDashboard = async (
  req: Request<DashboardBuildingTemperatureParams>,
  res: Response,
) => {
  try {
    const { building, timeRange } = req.query;
    const temperature = await getTemperatureData(
      building as string,
      timeRange as string,
      undefined,
    );
    res.status(200).json({ temperature });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};

export const getEntireBuildingPeopleCountDashboard = async (
  req: Request<DashboardBuildingPeopleCountParams>,
  res: Response,
) => {
  try {
    const { building, timeRange } = req.query;
    const peopleCount = await getPeopleCountData(
      building as string,
      timeRange as string,
      undefined,
    );
    res.status(200).json({ peopleCount });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
};
