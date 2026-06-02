import { createApp } from "./app.js";
import { config } from "./config.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`key-project-dashboard listening on http://0.0.0.0:${config.port}`);
});
