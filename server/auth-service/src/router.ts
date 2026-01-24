import { Router } from 'express';
import { domain, domainLevel, login, register } from "./controller/authController.js";

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/domain/:username', domain);
router.get('/domain/level/:username', domainLevel);

export default router;