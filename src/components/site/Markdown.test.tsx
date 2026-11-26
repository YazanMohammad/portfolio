import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { Markdown } from "./Markdown";

describe("Markdown", () => {
  it("starts article sections at h2 and prevents skipped heading levels", () => {
    render(<Markdown article source={'## First section\n\n#### Nested section\n\n## Next section'} />);
    expect(screen.getByRole("heading", {name:"First section",level:2})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name:"Nested section",level:3})).toBeInTheDocument();
    expect(screen.getByRole("heading", {name:"Next section",level:2})).toBeInTheDocument();
  });
  it("renders safe GFM with shifted headings and scrollable code", () => {
    const { container } = render(<Markdown source={'# One\n\n## Two\n\n### Three\n\n#### Four\n\n##### Five\n\n###### Six\n\n~~removed~~\n\n| A | B |\n| - | - |\n| x | y |\n\n```ts\n' + 'x'.repeat(500) + '\n```'} />);
    for (const [name, level] of [["One", 2], ["Two", 3], ["Three", 4], ["Four", 4], ["Five", 5], ["Six", 6]] as const) expect(screen.getByRole("heading", { name, level })).toBeInTheDocument();
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("del")).toHaveTextContent("removed");
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(container.querySelector("pre")).toHaveClass("markdown-code");
    expect(readFileSync("src/styles/project.css", "utf8")).toMatch(/\.markdown-code\s*\{[^}]*overflow-x:\s*auto/);
  });

  it("retains default URL filtering and protects external anchors", () => {
    render(<Markdown source={'[bad](javascript:alert%281%29) [ok](https://example.com) [local](/projects/demo)'} />);
    expect(screen.getByText("bad").closest("a")).not.toHaveAttribute("href", expect.stringMatching(/^javascript:/i));
    expect(screen.getByRole("link", { name: "ok" })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "local" })).toHaveAttribute("href", "/projects/demo");
  });

  it.each(["https://example.com/p.png", "http://example.com/p.png", "//example.com/p.png", "/other/p.png", "/api/files/", "/api/files/../x", "/api/files/%0Ax", "/api/files/x?next=bad", "/api/files/x\\\\bad", "data:image/png;base64,abc"])("rejects image source %s", (src) => {
    const { container } = render(<Markdown source={`![unsafe](<${src}>)`} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it.each(["/api/files/folder%2Fphoto.png"])("allows image source %s", (src) => {
    render(<Markdown source={`![Picture](${src})`} />);
    expect(screen.getByRole("img", { name: "Picture" })).toHaveAttribute("src", src);
  });

  it("has no raw HTML execution path in public components or pages", () => {
    for (const dir of ["src/components/site", "src/pages/site"]) {
      for (const file of readdirSync(dir).filter((name) => name.endsWith(".tsx") && !name.includes(".test."))) {
        const source = readFileSync(`${dir}/${file}`, "utf8");
        expect(source).not.toMatch(/dangerouslySetInnerHTML|rehype-raw/);
      }
    }
  });
  it("keeps raw HTML visible as text without executing elements", () => {
    const source = '<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>';
    const { container } = render(<Markdown source={source} />);
    expect(container.querySelector("script, img")).toBeNull();
    expect(container).toHaveTextContent('<script>alert(1)</script>');
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});
