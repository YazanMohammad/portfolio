import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
it('drops a thumbnail that cannot be loaded',()=>{const noop=()=>{};const {container}=render(<ul><SortableRow id={1} title="A" subtitle={null} isVisible toFillIn={false} isFirst isLast thumbnail="/api/files/image.png" featured onOpen={noop} onToggleVisible={noop} onMoveUp={noop} onMoveDown={noop} onDuplicate={noop} onDelete={noop}/></ul>);const image=container.querySelector('img')!;fireEvent.error(image);expect(container.querySelector('img')).toBeNull();expect(screen.getByText('Featured')).toBeInTheDocument();});
import { SortableRow } from "./SortableRow";

describe("SortableRow keyboard reorder", () => {
  it("shows explicit move buttons without a drag handle", () => {
    const noop = () => {};
    render(
          <ul>
            <SortableRow id={1} title="A" subtitle={null} isVisible toFillIn={false} isFirst isLast onOpen={noop}
              onToggleVisible={noop} onMoveUp={noop} onMoveDown={noop} onDuplicate={noop} onDelete={noop} />
          </ul>

    );
    expect(screen.queryByRole("button", {name:"Reorder A"})).toBeNull();
    expect(screen.getByRole("button", {name:"Move A up"})).toBeDisabled();
    expect(screen.getByRole("button", {name:"Move A down"})).toBeDisabled();
  });
});

