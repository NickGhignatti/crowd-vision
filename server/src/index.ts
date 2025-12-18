import type {Request, Response} from 'express';
import express from 'express'
import cors from "cors";
import {connectMongo} from "./db/server";
import {swaggerSetup} from "./swagger";
import {createUser, getUserDomain, validateUser} from "./utils/auth"
import {getBuilding, uploadBuilding} from "./utils/dashboard";

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

app.get("/domain/:username", (req: Request, res: Response) => {
    return getUserDomain(req, res);
});

app.post("/building", (req: Request, res: Response) => {
    return uploadBuilding(req, res);
});

app.get("/building/:id", (req: Request, res: Response) => {
    return getBuilding(req, res);
});

swaggerSetup()

if (process.env.NODE_ENV !== 'test') {
    connectMongo().then(() => {
        app.listen(PORT, () => console.log(`Server running on localhost:${PORT}`));
    });
}