import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { adminTitleFor, useAdminTitle } from "./useAdminTitle";

describe("admin titles", () => {
  it("maps every admin route to its own title", () => {
    expect(adminTitleFor("/admin/projects")).toBe("Projects · Admin");
    expect(adminTitleFor("/admin/site-text")).toBe("Site text · Admin");
    expect(adminTitleFor("/admin/look")).toBe("Look · Admin");
    expect(adminTitleFor("/admin/messages/3")).toBe("Messages · Admin");
    expect(adminTitleFor("/admin")).toBe("Admin");
    const all = ["dashboard", "site-text", "look", "profile", "projects", "experience", "education", "skills", "messages"]
      .map((s) => adminTitleFor(`/admin/${s}`));
    expect(new Set(all).size).toBe(9);
  });
  it("sets and restores document.title", () => {
    document.title = "Public";
    const { unmount } = renderHook(() => useAdminTitle("Login · Admin"));
    expect(document.title).toBe("Login · Admin");
    unmount();
    expect(document.title).toBe("Public");
  });
});
