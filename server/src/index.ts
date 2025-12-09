import express from 'express'
import cors from "cors";
import {connectMongo} from "./server";
import {swaggerSetup} from "./swagger";

export const app = express()
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

swaggerSetup()

connectMongo().then(() => {
    app.listen(PORT, () => console.log(`Server running on localhost:${PORT}`));
});