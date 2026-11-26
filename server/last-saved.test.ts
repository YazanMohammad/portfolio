import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { siteState } from "../db/schema";
const mocks = vi.hoisted(() => ({ insert: vi.fn(), values: vi.fn(), conflict: vi.fn(), batch: vi.fn(), persisted: vi.fn() }));
vi.mock("../db/client", () => ({ db: { insert: mocks.insert, batch: mocks.batch } }));
import { touchLastSaved } from "./last-saved";
beforeEach(() => { vi.clearAllMocks(); mocks.insert.mockReturnValue({ values: mocks.values }); mocks.values.mockReturnValue({ onConflictDoUpdate: mocks.conflict }); mocks.conflict.mockReturnValue({ then: (resolve: (value: unknown) => void) => { mocks.persisted(); resolve(undefined); } }); mocks.batch.mockResolvedValue([]); });
it("upserts singleton lastSavedAt using database now on insert and conflict", async () => {
 await touchLastSaved(); expect(mocks.insert).toHaveBeenCalledWith(siteState); const values = mocks.values.mock.calls[0][0]; const conflict = mocks.conflict.mock.calls[0][0]; expect(values.id).toBe(1); expect(conflict.target).toBe(siteState.id); const dialect = new PgDialect(); expect(dialect.sqlToQuery(values.lastSavedAt).sql).toBe("now()"); expect(dialect.sqlToQuery(conflict.set.lastSavedAt).sql).toBe("now()"); expect(mocks.persisted).toHaveBeenCalledOnce(); expect(mocks.batch).not.toHaveBeenCalled();
});
it("batches a supplied content write before the timestamp in one transaction", async () => {
 const write = {} as NonNullable<Parameters<typeof touchLastSaved>[0]>; await touchLastSaved(write); expect(mocks.batch).toHaveBeenCalledExactlyOnceWith([write, mocks.conflict.mock.results[0].value]); expect(mocks.persisted).not.toHaveBeenCalled();
});
it("batches reorder writes and timestamp flat in one transaction", async () => {
 const writes = [{ first: true }, { second: true }] as unknown as NonNullable<Parameters<typeof touchLastSaved>[0]>;
 await touchLastSaved(writes);
 expect(mocks.batch).toHaveBeenCalledExactlyOnceWith([...writes as unknown as object[], mocks.conflict.mock.results[0].value]);
});
it("propagates batch failure so callers cannot delete old blobs", async () => {
 mocks.batch.mockRejectedValueOnce(new Error("failed")); await expect(touchLastSaved({} as NonNullable<Parameters<typeof touchLastSaved>[0]>)).rejects.toThrow("failed");
});
