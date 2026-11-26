import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { Nav } from "./Nav";

it("opens the index, closes on Escape with focus return, and closes on selection", async () => {
  const user = userEvent.setup();
  render(<Nav name="Yazan" sections={[{ id: "work", label: "Work" }]} />);
  const toggle = screen.getByRole("button", { name: "Index +" });
  expect(toggle.textContent).toBe("Index +");
  await user.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  await user.keyboard("{Escape}");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  await user.click(toggle);
  screen.getByRole("link", { name: "Work" }).focus();
  await user.keyboard("{Escape}");
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(toggle).toHaveFocus();
  await user.click(toggle);
  await user.click(screen.getByRole("link", { name: "Work" }));
  expect(toggle).toHaveAttribute("aria-expanded", "false");
});
