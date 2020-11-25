This is an attempt to create a DialogFlow fullfillment
serverless function.

## Quick start

It's easiest to develop locally and point DialogFlow at your
local server (using e.g. ngrok as a tunnel).

In one terminal, run:

```
yarn
yarn watch
```

Then in another terminal, run `node server.js`.

## Serverless deployment

Run `yarn build` then copy `serverless.bundle.js` to the inline
cloud editor thing in Dialogflow. Make sure you also copy over
`package.json` so the right dependencies are copied over too.
