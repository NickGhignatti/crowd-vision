import type {Request, Response} from 'express';
import {getDomainLevel, getUserDomain, loginUser, registerUser} from "../services/authService.js";
import type {UserParams} from "../models/user.js";

export const register = async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;
        const user = await registerUser(username, email, password);
        res.status(201).json({ message: 'User created', userId: user._id, username: user.username });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        const user = await loginUser(username, password);
        res.status(200).json({ message: 'Login successful', userId: user._id, username: user.username });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const domain = async (req: Request<UserParams>, res: Response) => {
    try {
        const { userId } = req.params;
        const domain = await getUserDomain(userId);
        res.status(200).json({ domain });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}

export const domainLevel = async (req: Request<UserParams>, res: Response) => {
    try {
        const { userId } = req.params;
        const domain = await getUserDomain(userId);
        const domainLevel = await getDomainLevel(domain);
        res.status(200).json({ domainLevel });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
}
