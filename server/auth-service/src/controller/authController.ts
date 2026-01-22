import type {Request, Response} from 'express';
import {loginUser, registerUser} from "../services/authService.js";

export const register = async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;
        const user = await registerUser(username, email, password);
        res.status(201).json({ message: 'User created', userId: user._id });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        const user = await loginUser(username, password);
        res.status(200).json({ message: 'Login successful', userId: user._id });
    } catch (error: any) {
        res.status(400).json({ error: error.message });
    }
};