import { betterAuth } from "better-auth";
import { authPlugins } from "../src/lib/auth/plugins";

// Schema generation only; never imported by the running application.
export const auth = betterAuth({
  baseURL: "http://127.0.0.1:3000",
  emailAndPassword: { enabled: true },
  rateLimit: { enabled: true, storage: "database" },
  plugins: authPlugins("http://127.0.0.1:3000"),
});
