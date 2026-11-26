import { LoginInput } from "../../shared/index";
import { checkOrigin, clientIp, createSession, deleteSession, fail, handle, hashIp, markLoginSuccess,
  noContent, notFound, readJson, readSessionToken, reserveLoginAttempt, sessionCookie, verifyPassword } from "../../server/index";
export const config = { path: "/api/auth/login", method: "POST" };
export const loginDelayMs = 500;
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export default handle(async (req, ctx) => {
  const started = performance.now();
  if (req.method !== "POST") throw notFound();
  checkOrigin(req);
  const { password } = await readJson(req, LoginInput.strict());
  const ipHash = hashIp(clientIp(req, ctx));
  const reservation = await reserveLoginAttempt(ipHash);
  if (!reservation.allowed) throw fail("rate_limited", "Try again later.", { retryAfter: reservation.retryAfter });
  if (!await verifyPassword(password, process.env.ADMIN_PASSWORD_HASH ?? "")) {
    // Generic diagnostic: never log the supplied password or configured hash.
    console.error("Login password verification failed; check ADMIN_PASSWORD_HASH configuration if unexpected.");
    const remaining = loginDelayMs - (performance.now() - started);
    if (remaining > 0) await sleep(Math.ceil(remaining));
    throw fail("unauthorized", "Wrong password.");
  }
  await markLoginSuccess(ipHash, reservation.attemptId);
  const oldToken = readSessionToken(req);
  if (oldToken) await deleteSession(oldToken);
  const { token } = await createSession();
  return noContent({ "Set-Cookie": sessionCookie(token) });
});
