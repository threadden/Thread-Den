// Netlify Server entrypoint: serves the Express API (/api/*).
// The React storefront itself is built by Vite and served statically from dist/.
import app from "../../apiApp";

export const config = {
  path: "/api/*",
};

export default app;
