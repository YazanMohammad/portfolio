import { MessageInput } from "../../shared/index";
import { HttpError, checkOrigin, clientIp, fail, handle, hashIp, insertMessageIfAllowed, json, messageRetryAfter, notFound, readJson } from "../../server/index";
export const config = { path: "/api/messages", method: "POST" };
export default handle(async (req, ctx) => {
  if (req.method !== "POST") throw notFound();
  checkOrigin(req);
  let input: MessageInput;
  try {
    input = await readJson(req, MessageInput);
  } catch (error) {
    // Do not identify the honeypot, including alongside other invalid fields.
    if (error instanceof HttpError && error.fields && Object.hasOwn(error.fields, "website")) {
      throw fail("validation", "Check the fields.");
    }
    throw error;
  }
  const ipHash = hashIp(clientIp(req, ctx));
  if (!await insertMessageIfAllowed(ipHash, input)) {
    throw fail("rate_limited", "Try again later.", { retryAfter: await messageRetryAfter(ipHash) });
  }
  return json({ ok: true }, { status: 201 });
});
