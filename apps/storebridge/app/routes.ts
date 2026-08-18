import { flatRoutes } from "@react-router/fs-routes";

// Folder-based routes (e.g. routes/app.foo/route.tsx) can safely colocate
// components/hooks/utils/*.test.tsx anywhere inside them without config —
// @react-router/fs-routes only reads one level into app/routes/ and, for a
// directory, only looks for a route.*/index.* file directly inside it; it
// never recurses into subfolders. Flat-file routes (e.g. routes/app.foo.tsx)
// don't get that protection for free, since a sibling *.test.tsx would be a
// top-level file fs-routes would otherwise try to parse as its own route —
// hence the explicit ignore below, verified against the installed package's
// source (node_modules/@react-router/fs-routes/dist/index.js).
export default flatRoutes({
  ignoredRouteFiles: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
});
