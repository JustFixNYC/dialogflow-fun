## Quick start

```
yarn
yarn build
node server.js
```

To watch for changes, run `yarn watch`.

## Serverless deployment

Run `yarn build` then copy `serverless.bundle.js` to the inline
cloud editor thing in Dialogflow. Make sure you also copy over
`package.json` so the right dependencies are copied over too.
