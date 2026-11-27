import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { TimelineSection } from "./TimelineSection";
import fallback from "@/content/fallback.json";
import { readFileSync } from "node:fs";
it("reserves a date column from tablet widths upward",()=>{
 const css=readFileSync('src/components/site/site.css','utf8');
 expect(css).toContain('@media (min-width: 768px) and (max-width: 800px)');
 expect(css).toContain('grid-template-columns: max-content minmax(0, 1fr)');
});
it("keeps every experience and education date on one line", () => {
 const { container } = render(<TimelineSection experience={fallback.experience} education={fallback.education} />);
 for (const date of container.querySelectorAll('.rows__date')) expect(date).toHaveClass('date-nowrap');
});
