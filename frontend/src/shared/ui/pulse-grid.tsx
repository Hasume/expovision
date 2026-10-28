"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type DeviceType = "mobile" | "tablet" | "desktop";

function detectDevice(width: number): DeviceType {
  if (width < 810) return "mobile";
  if (width < 1200) return "tablet";
  return "desktop";
}

function svgPattern(color: string, dotSize: number, gap: number): string {
  const safeGap = Math.max(8, Math.round(gap));
  const safeDot = Math.max(1, dotSize);
  const radius = safeDot / 2;
  const cx = safeGap / 2;
  const cy = safeGap / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${safeGap}' height='${safeGap}'><circle cx='${cx}' cy='${cy}' r='${radius}' fill='${color}'/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function PulseGrid({
  className,
  dotSize = 2,
  gap = 24,
  radius = 190,
  maxScale = 2.2,
  baseColor = "rgba(11,16,32,0.10)",
  hoverColor = "#158aeb",
  disableOnMobile = true,
  disableOnTablet = false,
}: {
  className?: string;
  dotSize?: number;
  gap?: number;
  radius?: number;
  maxScale?: number;
  baseColor?: string;
  hoverColor?: string;
  disableOnMobile?: boolean;
  disableOnTablet?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [deviceType, setDeviceType] = useState<DeviceType>("desktop");

  useEffect(() => {
    const onResize = (): void => setDeviceType(detectDevice(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const showHoverLayer = !(
    (disableOnMobile && deviceType === "mobile") ||
    (disableOnTablet && deviceType === "tablet")
  );

  useEffect(() => {
    if (!showHoverLayer) return;
    const onMove = (event: MouseEvent): void => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      window.requestAnimationFrame(() => {
        container.style.setProperty("--pulse-x", `${x}px`);
        container.style.setProperty("--pulse-y", `${y}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, [showHoverLayer]);

  const basePattern = useMemo(() => svgPattern(baseColor, dotSize, gap), [baseColor, dotSize, gap]);
  const hoverPattern = useMemo(() => svgPattern(hoverColor, dotSize * maxScale, gap), [hoverColor, dotSize, maxScale, gap]);

  const rootStyle = {
    "--pulse-x": "-1000px",
    "--pulse-y": "-1000px",
  } as CSSProperties;

  return (
    <div ref={containerRef} className={`pulse-grid ${className ?? ""}`.trim()} style={rootStyle} aria-hidden="true">
      <div className="pulse-grid-base" style={{ backgroundImage: basePattern }} />
      {showHoverLayer ? (
        <div
          className="pulse-grid-hover"
          style={{
            backgroundImage: hoverPattern,
            WebkitMaskImage: `radial-gradient(circle ${radius}px at var(--pulse-x) var(--pulse-y), black 0%, transparent 100%)`,
            maskImage: `radial-gradient(circle ${radius}px at var(--pulse-x) var(--pulse-y), black 0%, transparent 100%)`,
          }}
        />
      ) : null}
    </div>
  );
}

