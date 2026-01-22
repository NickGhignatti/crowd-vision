import { Router } from 'express';
import {domain, domainLevel, login, register} from "./controller/authController.js";

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/domain/:userId', domain);
router.get('/domain/level/:userId', domainLevel);

export default router;