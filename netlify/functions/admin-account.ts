import type { Config } from "@netlify/functions";
import { AccountInput } from "../../shared/index";
import { adminHandler } from "../../server/handlers";
import { fail, json, notFound, readJson } from "../../server/http";
import { checkAdminPassword, readAdminAccount, saveAdminAccount } from "../../server/admin-account";
import { clientIp, hashIp } from "../../server/ip";
import { hashPassword } from "../../server/password";
import { markLoginSuccess, reserveLoginAttempt } from "../../server/rate-limit";
import { createSession, sessionCookie } from "../../server/sessions";

// Contract §12. GET returns only the username (never the hash). PUT changes the username and/or
// password; it needs the current password and shares the login rate limit. On success every
// session ends and this browser gets a fresh one.
export default adminHandler(async (req, ctx) => {
  if (new URL(req.url).pathname !== "/api/admin/account" || !["GET", "PUT"].includes(req.method)) throw notFound();
  if (req.method === "GET") return json({ username: (await readAdminAccount())?.username ?? null });

  const input = await readJson(req, AccountInput);
  const ipHash = hashIp(clientIp(req, ctx));
  const reservation = await reserveLoginAttempt(ipHash);
  if (!reservation.allowed) throw fail("rate_limited", "Try again later.", { retryAfter: reservation.retryAfter });
  const { ok, account } = await checkAdminPassword(input.currentPassword);
  if (!ok || !account) throw fail("unauthorized", "Wrong current password.", { fields: { currentPassword: "Wrong password." } });
  await markLoginSuccess(ipHash, reservation.attemptId);

  const passwordHash = input.newPassword === undefined ? account.passwordHash : await hashPassword(input.newPassword);
  await saveAdminAccount(input.username, passwordHash);
  const { token } = await createSession();
  return json({ username: input.username }, { headers: { "Set-Cookie": sessionCookie(token) } });
});
export const config: Config = { path: "/api/admin/account" };
