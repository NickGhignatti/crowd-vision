import { Router } from 'express';
import { 
    postPeopleCount, 
    postTemperature, 
    postAirQuality,
    getSinglePeopleCount,
    getSingleTemperature,
    getSingleAirQuality,
    getAllPeopleCount,
    getAllTemperature,
    getAllAirQuality,
    getPeopleCountDashboard,
    getTemperatureDashboard,
    getAirQualityDashboard,
    getEntireBuildingPeopleCountDashboard,
    getEntireBuildingTemperatureDashboard,
    getEntireBuildingAirQualityDashboard,
    getMetricsContract
} from "./controller/sensorController.js";
import {
    createBuildingThreshold,
    getBuildingThreshold,
    patchBuildingThreshold,
    patchRoomThreshold,
    syncBuilding,
} from "./controller/thresholdController.js";

const router = Router();

router.post('/peopleCount', postPeopleCount);
router.post('/temperature', postTemperature);
router.post('/air-quality', postAirQuality);
router.get('/peopleCount', getSinglePeopleCount);
router.get('/temperature', getSingleTemperature);
router.get('/air-quality', getSingleAirQuality);
router.get('/peopleCount/entireBuilding', getAllPeopleCount);
router.get('/temperature/entireBuilding', getAllTemperature);
router.get('/air-quality/entireBuilding', getAllAirQuality);
router.get('/peopleCount/dashboard', getPeopleCountDashboard);
router.get('/temperature/dashboard', getTemperatureDashboard);
router.get('/air-quality/dashboard', getAirQualityDashboard);
router.get('/peopleCount/dashboard/entireBuilding', getEntireBuildingPeopleCountDashboard);
router.get('/temperature/dashboard/entireBuilding', getEntireBuildingTemperatureDashboard);
router.get('/air-quality/dashboard/entireBuilding', getEntireBuildingAirQualityDashboard);
router.get('/thresholds/buildings/:buildingId', getBuildingThreshold);
router.post('/thresholds/buildings', createBuildingThreshold);
router.put('/thresholds/buildings/:buildingId', syncBuilding);
router.patch('/thresholds/buildings/:buildingId', patchBuildingThreshold);
router.patch('/thresholds/buildings/:buildingId/rooms/:roomId', patchRoomThreshold);
router.get('/metrics', getMetricsContract);

export default router;