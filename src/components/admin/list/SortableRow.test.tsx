import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
it('drops a thumbnail that cannot be loaded',()=>{const noop=()=>{};const {container}=render(<ul><SortableRow id={1} title="A" subtitle={null} isVisible toFillIn={false} isFirst isLast thumbnail="/api/files/image.png" featured onOpen={noop} onToggleVisible={noop} onMoveUp={noop} onMoveDown={noop} onDuplicate={noop} onDelete={noop}/></ul>);const image=container.querySelector('img')!;fireEvent.error(image);expect(container.querySelector('img')).toBeNull();expect(screen.getByText('Featured')).toBeInTheDocument();});
import { DndContext } from "@dnd-kit/core";
import { SortableContext } from "@dnd-kit/sortable";
import { SortableRow } from "./SortableRow";

describe("SortableRow keyboard reorder", () => {
  it("shows explicit move buttons without a drag handle", () => {
    const noop = () => {};
    render(
      <DndContext>
        <SortableContext items={[1]}>
          <ul>
            <SortableRow id={1} title="A" subtitle={null} isVisible toFillIn={false} isFirst isLast onOpen={noop}
              onToggleVisible={noop} onMoveUp={noop} onMoveDown={noop} onDuplicate={noop} onDelete={noop} />
          </ul>
        </SortableContext>
      </DndContext>,
    );
    expect(screen.queryByRole("button", {name:"Reorder A"})).toBeNull();
    expect(screen.getByRole("button", {name:"Move A up"})).toBeDisabled();
    expect(screen.getByRole("button", {name:"Move A down"})).toBeDisabled();
  });
});

