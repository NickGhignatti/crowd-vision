import { Router } from 'express';
import { 
    postPeopleCount, 
    postTemperature, 
    getPeopleCount, 
    getTemperature,
    getPeopleCountDashboard,
    getTemperatureDashboard,
    getEntireTwinPeopleCountDashboard,
    getEntireTwinTemperatureDashboard
} from "./controller/sensorController.js";

const router = Router();

router.post('/peopleCount', postPeopleCount);
router.post('/temperature', postTemperature);
router.get('/peopleCount', getPeopleCount);
router.get('/temperature', getTemperature);
router.get('/peopleCount/dashboard', getPeopleCountDashboard);
router.get('/temperature/dashboard', getTemperatureDashboard);
router.get('/peopleCount/dashboard/entireTwin', getEntireTwinPeopleCountDashboard);
router.get('/temperature/dashboard/entireTwin', getEntireTwinTemperatureDashboard);

export default router;