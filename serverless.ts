import functions from "firebase-functions";
import { DialogflowWebhookResponse, handleRequest } from "./handler";

export const dialogflowFirebaseFulfillment = functions.https.onRequest(async (req, res) => {
  const dfRes: DialogflowWebhookResponse = await handleRequest(req.body);
  res.json(dfRes);
});
