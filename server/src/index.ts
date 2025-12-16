import express from 'express'
import cors from "cors";
import {connectMongo} from "./db/server";
import {swaggerSetup} from "./swagger";
import {createUser, validateUser} from "./utils/auth"
import type { Request, Response } from 'express';
import {getAllRoomsData} from "./utils/dashboard";

export const app = express()
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/health", (_: Request, res: Response) => {
    res.status(200).send("OK");
});

app.post("/createUser", (req: Request, res: Response) => {
    return createUser(req, res);
});

app.post("/validateUser", (req: Request, res: Response) => {
    return validateUser(req, res);
});

app.get("/roomData", (req: Request, res: Response) => {
    return getAllRoomsData(req, res);
});

swaggerSetup()

if (process.env.NODE_ENV !== 'test') {
    connectMongo().then(() => {
        app.listen(PORT, () => console.log(`Server running on localhost:${PORT}`));
    });
}