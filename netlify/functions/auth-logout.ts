import { checkOrigin, clearSessionCookie, deleteSession, handle, noContent, notFound, readSessionToken } from "../../server/index";
export const config = { path: "/api/auth/logout", method: "POST" };
export default handle(async (req) => {
  if (req.method !== "POST") throw notFound();
  checkOrigin(req);
  const token = readSessionToken(req);
  if (token) await deleteSession(token);
  return noContent({ "Set-Cookie": clearSessionCookie() });
});
