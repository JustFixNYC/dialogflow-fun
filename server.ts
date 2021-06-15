import express from "express";
import bodyParser from "body-parser";
import { DialogflowWebhookResponse, handleRequest } from "./handler";

const PORT = process.env['PORT'] || '3000';

const app = express();

app.use(bodyParser.json());

app.post('/', async (req, res) => {
  const dfRes: DialogflowWebhookResponse = await handleRequest(req.body);
  res.json(dfRes);
});

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}.`);
});
