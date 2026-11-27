import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { TimelineSection } from "./TimelineSection";
import fallback from "@/content/fallback.json";
it("keeps every experience and education date on one line", () => {
 const { container } = render(<TimelineSection experience={fallback.experience} education={fallback.education} />);
 for (const date of container.querySelectorAll('.rows__date')) expect(date).toHaveClass('date-nowrap');
});
