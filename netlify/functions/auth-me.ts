import { adminHandler, handle, json, notFound } from "../../server/index";
export const config = { path: "/api/auth/me", method: "GET" };
const authenticated = adminHandler(async () => json({ authenticated: true }));
export default handle(async (req, ctx) => {
  // Method rejection must precede the admin wrapper's session I/O.
  if (req.method !== "GET") throw notFound();
  return authenticated(req, ctx);
});
