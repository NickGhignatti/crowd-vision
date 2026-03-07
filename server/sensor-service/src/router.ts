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
    getEntireTwinPeopleCountDashboard,
    getEntireTwinTemperatureDashboard
} from "./controller/sensorController.js";

const router = Router();

router.post('/peopleCount', postPeopleCount);
router.post('/temperature', postTemperature);
router.get('/peopleCount', getSinglePeopleCount);
router.get('/temperature', getSingleTemperature);
router.get('/peopleCount/entireTwin', getAllPeopleCount);
router.get('/temperature/entireTwin', getAllTemperature);
router.get('/peopleCount/dashboard', getPeopleCountDashboard);
router.get('/temperature/dashboard', getTemperatureDashboard);
router.get('/peopleCount/dashboard/entireTwin', getEntireTwinPeopleCountDashboard);
router.get('/temperature/dashboard/entireTwin', getEntireTwinTemperatureDashboard);

export default router;