import express from 'express'
import cors from 'cors';
import router from "./router.js";
import {connectMongo} from "./config/db.js";

const app = express();
const PORT = 3000;


app.use(cors());
app.use(express.json());
app.use('/', router)

// Health Check
app.get('/', (req, res) => {
  res.send({ status: 'Service Running', simulator: 'active' });
});

if (process.env.NODE_ENV !== 'test') {
    connectMongo().then(() => {
        app.listen(PORT, () => console.log(`Authentication service running on localhost:${PORT}`));
    });
}