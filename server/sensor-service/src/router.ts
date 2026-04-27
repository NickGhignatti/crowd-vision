import { Router } from 'express';
import { 
    postPeopleCount, 
    postTemperature, 
    getSinglePeopleCount, 
    getSingleTemperature,
    getAllPeopleCount,
    getAllTemperature,
    getPeopleCountDashboard,
    getTemperatureDashboard,
    getEntireBuildingPeopleCountDashboard,
    getEntireBuildingTemperatureDashboard
} from "./controller/sensorController.js";
import {
    getBuildingThreshold,
    patchBuildingThreshold,
    patchRoomThreshold,
    syncBuilding,
} from "./controller/thresholdController.js";

const router = Router();

router.post('/peopleCount', postPeopleCount);
router.post('/temperature', postTemperature);
router.get('/peopleCount', getSinglePeopleCount);
router.get('/temperature', getSingleTemperature);
router.get('/peopleCount/entireBuilding', getAllPeopleCount);
router.get('/temperature/entireBuilding', getAllTemperature);
router.get('/peopleCount/dashboard', getPeopleCountDashboard);
router.get('/temperature/dashboard', getTemperatureDashboard);
router.get('/peopleCount/dashboard/entireBuilding', getEntireBuildingPeopleCountDashboard);
router.get('/temperature/dashboard/entireBuilding', getEntireBuildingTemperatureDashboard);
router.get('/thresholds/buildings/:buildingId', getBuildingThreshold);
router.put('/thresholds/buildings/:buildingId', syncBuilding);
router.patch('/thresholds/buildings/:buildingId', patchBuildingThreshold);
router.patch('/thresholds/buildings/:buildingId/rooms/:roomId', patchRoomThreshold);

export default router;