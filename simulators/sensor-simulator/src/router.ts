import { Router } from 'express';
import { isRunning, registerBuilding } from "./controller/simController.js";
import { Simulator } from './services/simulatorService.js';

const router = Router();
const simulator = new Simulator();

router.post('/control/building', (req, res) => {
  registerBuilding(simulator, req, res);
});



router.get('/control/status', (req, res) => {
  isRunning(simulator, req, res);
});

export default router;