import { Router } from 'express';
import { 
    postPeopleCount, 
    postTemperature, 
    getPeopleCount, 
    getTemperature,
    getPeopleCountDashboard,
    getTemperatureDashboard
} from "./controller/sensorController.js";

const router = Router();

router.post('/peopleCount', postPeopleCount);
router.post('/temperature', postTemperature);
router.get('/peopleCount', getPeopleCount);
router.get('/temperature', getTemperature);
router.get('/peopleCount/dashboard', getPeopleCountDashboard);
router.get('/temperature/dashboard', getTemperatureDashboard);

export default router;