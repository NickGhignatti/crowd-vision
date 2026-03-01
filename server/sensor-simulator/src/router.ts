import { Router } from 'express';
import { start, stop, isRunning } from "./controller/simController.js";
import { Simulator } from './services/simulatorService.js';

const router = Router();
const simulator = new Simulator();

router.post('/control/start', (req, res) => {
  start(simulator, req, res);
});

router.post('/control/stop', (req, res) => {
  stop(simulator, req, res);
});

router.get('/control/status', (req, res) => {
  isRunning(simulator, req, res);
});

export default router;