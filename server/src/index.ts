import express from 'express'
import cors from "cors";
import {connectMongo} from "./server";
import {swaggerSetup} from "./swagger";
import {createUser, validateUser} from "./auth"
import type { Request, Response } from 'express';

export const app = express()
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

swaggerSetup()

connectMongo().then(() => {
    app.get("/health", (_: Request, res: Response) => {
        res.status(200).send("OK");
    })

    app.post("/createUser", (req: Request, res: Response) => {
        return createUser(req, res);
    })

    app.post("/validateUser", (req: Request, res: Response) => {
        return validateUser(req, res);
    })

    app.listen(PORT, () => console.log(`Server running on localhost:${PORT}`));
});