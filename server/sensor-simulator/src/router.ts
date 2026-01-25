import { Router } from 'express';
import { start, stop } from "./controller/simController.js";
import { Simulator } from './services/simulatorService.js';

const router = Router();
const simulator = new Simulator();

router.post('/control/start', (req, res) => {
  start(simulator, req, res);
  res.send({ message: 'Simulator started' });
});

router.post('/control/stop', (req, res) => {
  stop(simulator, req, res);
  res.send({ message: 'Simulator stopped' });
});

export default router;