import { handle, notFound } from "../../server/index";

export default handle(async () => {
  throw notFound();
});
