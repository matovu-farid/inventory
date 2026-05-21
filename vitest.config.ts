import { defineConfig  } from "vitest/config"
import type {UserConfig} from "vitest/config";
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()] as UserConfig["plugins"],
  resolve: {
    alias: {
      "#": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    include: [
      "src/__tests__/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.test.{ts,tsx}",
    ],
    environment: "node",
  },
})
