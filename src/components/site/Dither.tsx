import { useEffect, useRef } from "react";
import { useSiteTheme } from "@/lib/site/settings";
import { useMedia } from "./Poster";

/** Dot-halftone solids. Geometry is cached; only the light moves per frame. */
export function Dither({ shape = 0, animate = false, className = "" }: { shape?: number; animate?: boolean; className?: string }) {
  const theme = useSiteTheme();
  const hidden = className.includes("section-art") && !theme.sectionShapes;
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  useEffect(() => {
    if (hidden) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const size = 280, dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr; canvas.height = size * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const dots: { x: number; y: number; nx: number; ny: number; z: number }[] = [];
    for (let y = 6; y < size; y += 4) for (let x = 6; x < size; x += 4) {
      const nx = (x - 140) / 124, ny = (y - 140) / 124, r = nx * nx + ny * ny;
      let z: number;
      if (shape === 3) { if (r > 1 || nx < 0) continue; z = Math.sqrt(1 - r); }
      else if (shape % 3 === 1) {
        const slab = ((ny + nx * .28 + 1.2) % .58 + .58) % .58;
        if (Math.abs(nx) > .86 || Math.abs(ny + nx * .28) > .88 || slab > .30) continue;
        z = .25 + slab * 2;
      } else if (shape % 3 === 2) {
        const radius = Math.sqrt(nx * nx + ny * ny * 1.45);
        if (radius < .46 || radius > 1) continue;
        z = Math.sqrt(Math.max(0, 1 - ((radius - .73) / .27) ** 2));
      } else { if (r > 1) continue; z = Math.sqrt(1 - r); }
      dots.push({ x, y, nx, ny, z });
    }
    let frame = 0, visible = true, disposed = false, last = 0;
    const pointer = { x: -.5, y: -.5 };
    const move = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      pointer.x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1));
      pointer.y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1));
    };
    const draw = (time = 0) => {
      ctx.clearRect(0, 0, size, size); ctx.fillStyle = className.includes("footer-art") ? theme.onAccent : theme.accent;
      const drift = animate && !reduced ? Math.sin(time / 5000) * .16 : 0;
      const lx = pointer.x + drift, ly = pointer.y;
      for (const dot of dots) {
        const light = Math.max(.08, Math.min(1, .3 + dot.z * .65 + dot.nx * lx * .45 + dot.ny * ly * .45));
        const width = .5 + light * 2.8;
        ctx.fillRect(dot.x - width / 2 + drift * 18, dot.y - width / 2 + drift * 9, width, width);
      }
    };
    const loop = (time: number) => {
      if (disposed || !visible) return;
      if (time - last >= 32) { draw(time); last = time; }
      frame = requestAnimationFrame(loop);
    };
    draw();
    let observer: IntersectionObserver | undefined;
    if (animate && !reduced) {
      frame = requestAnimationFrame(loop);
      canvas.addEventListener("pointermove", move);
      if (typeof IntersectionObserver !== "undefined") {
        observer = new IntersectionObserver(entries => {
          const next = entries.some(entry => entry.isIntersecting);
          if (next === visible) return;
          visible = next; cancelAnimationFrame(frame);
          if (visible) frame = requestAnimationFrame(loop);
        }); observer.observe(canvas);
      }
    }
    return () => { disposed = true; cancelAnimationFrame(frame); observer?.disconnect(); canvas.removeEventListener("pointermove", move); };
  }, [shape, animate, reduced, theme.accent, theme.onAccent, className, hidden]);
  if (hidden) return null;
  return <canvas ref={ref} width="280" height="280" className={`dither ${className}`} aria-hidden="true" />;
}
