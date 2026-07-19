import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // For a project site use: base: '/YOUR-REPOSITORY-NAME/'
  base: process.env.GITHUB_ACTIONS ? "/hr-pcmd-dashboard/" : "/",
});
