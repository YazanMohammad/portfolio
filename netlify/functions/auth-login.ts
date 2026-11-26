import { LoginInput } from "../../shared/index";
import { checkAdminCredentials, checkOrigin, clientIp, createSession, deleteSession, fail, handle, hashIp, markLoginSuccess,
  noContent, notFound, readJson, readSessionToken, reserveLoginAttempt, sessionCookie } from "../../server/index";
export const config = { path: "/api/auth/login", method: "POST" };
export const loginDelayMs = 500;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export default handle(async (req, ctx) => {
  const started = performance.now();
  if (req.method !== "POST") throw notFound();
  checkOrigin(req);
  const { username, password } = await readJson(req, LoginInput.strict());
  const ipHash = hashIp(clientIp(req, ctx));
  const reservation = await reserveLoginAttempt(ipHash);
  if (!reservation.allowed) throw fail("rate_limited", "Try again later.", { retryAfter: reservation.retryAfter });
  // One generic answer for a wrong username, a wrong password or no account at all.
  if (!await checkAdminCredentials(username, password)) {
    const remaining = loginDelayMs - (performance.now() - started);
    if (remaining > 0) await sleep(Math.ceil(remaining));
    throw fail("unauthorized", "Wrong username or password.");
  }
  await markLoginSuccess(ipHash, reservation.attemptId);
  const oldToken = readSessionToken(req);
  if (oldToken) await deleteSession(oldToken);
  const { token } = await createSession();
  return noContent({ "Set-Cookie": sessionCookie(token) });
});
