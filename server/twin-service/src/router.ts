import { Router } from 'express';
import {getByDomain, getById, register} from "./controller/twinController.js";

const router = Router();

router.post('/register', register);
router.get('/building/:id', getById);
router.get('/buildings/:domain', getByDomain);

export default router;