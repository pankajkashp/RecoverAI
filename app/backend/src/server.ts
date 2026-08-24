import { createApp } from "./app.js";
import { environment } from "./config/env.js";

const app = createApp();

app.listen(environment.BACKEND_PORT, () => {
  console.log(`RecoverAI backend listening on port ${environment.BACKEND_PORT}`);
});