import express from 'express'
import cors from 'cors';
import router from "./router.js";

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
    app.listen(PORT, () => console.log(`Simulator service running on localhost:${PORT}`));
}