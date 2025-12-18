import * as bcrypt from 'bcryptjs';
import type {Request, Response} from 'express';
import {IUser, userSchema} from "../db/schema";
import {model} from "mongoose";

const saltValue = 10;
const User = model<IUser>('User', userSchema);

export async function createUser(req: Request, res: Response) {
    const {username, email, password} = req.body;
    const cryptedPassword = await bcrypt.hash(password, saltValue);
    const domain = String(email).split('@')[1];
    const user = new User({username, email, password: cryptedPassword, domain});
    await user.save();
    res.status(201).json({
        message: 'User created successfully.',
        user: {
            id: user._id,
            username: user.username,
        }
    });
}

export async function validateUser(req: Request, res: Response) {
    const {username, password} = req.body;
    const user = await User.findOne({username});

    if (!user) {
        return res.status(404).json({message: "User not found"});
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
        return res.status(401).json({message: "Invalid password"});
    }

    return res.status(200).json({
        message: "Login successful",
        user: {
            id: user._id,
            username: user.username,
        }
    });
}

export async function getUserDomain(req: Request, res: Response) {
    const username = req.params.username;
    const user = await User.findOne({username});

    if (!user) {
        return res.status(404).json({message: "User not found"});
    }

    return res.status(200).json({
        message: "User has a domain",
        domain: user.domain
    })
}