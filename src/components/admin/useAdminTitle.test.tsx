import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { adminTitleFor, AdminTitle } from "./useAdminTitle";

describe("admin titles", () => {
  it("lets the incoming public title win after public A → admin → public B", () => {
    function Admin() { return <AdminTitle title="Projects · Admin" />; }
    const view = render(<title>Public A</title>);
    view.rerender(<Admin />);
    expect(document.title).toBe("Projects · Admin");
    view.rerender(<title>Specific project</title>);
    expect(document.title).toBe("Specific project");
  });
  it("maps every admin route to its own title", () => {
    expect(adminTitleFor("/admin/projects")).toBe("Projects · Admin");
    expect(adminTitleFor("/admin/site-text")).toBe("Site text · Admin");
    expect(adminTitleFor("/admin/look")).toBe("Look · Admin");
    expect(adminTitleFor("/admin/account")).toBe("Account · Admin");
    expect(adminTitleFor("/admin/messages/3")).toBe("Messages · Admin");
    expect(adminTitleFor("/admin")).toBe("Admin");
    const all = ["dashboard", "site-text", "look", "profile", "projects", "experience", "education", "skills", "messages"]
      .map((s) => adminTitleFor(`/admin/${s}`));
    expect(new Set(all).size).toBe(9);
  });
  it("sets and restores document.title", () => {
    const view = render(<title>Public</title>);
    view.rerender(<AdminTitle title="Login · Admin" />);
    expect(document.title).toBe("Login · Admin");
    view.rerender(<title>Public</title>);
    expect(document.title).toBe("Public");
  });
});
