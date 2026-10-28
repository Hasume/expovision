type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  showName?: boolean;
  /** "platform" matches product header wordmark (expo + vision AI). */
  nameVariant?: "academy" | "platform";
  className?: string;
  as?: "div" | "span";
};

const iconSizeMap: Record<NonNullable<BrandLogoProps["size"]>, number> = {
  sm: 28,
  md: 36,
  lg: 48,
};

export function BrandLogo({
  size = "md",
  showName = true,
  nameVariant = "academy",
  className,
  as = "div",
}: BrandLogoProps) {
  const RootTag = as;
  const iconPx = iconSizeMap[size];
  const cls = `brand-logo ${nameVariant === "platform" ? "brand-logo--platform" : ""} ${className ?? ""}`.trim();
  return (
    <RootTag className={cls} aria-label="expovision AI">
      <img src="/brand/logo-icon.png" alt="" className="brand-logo-icon" width={iconPx} height={iconPx} />
      {showName && nameVariant === "platform" ? (
        <span className="brand-logo-wordmark">
          <span className="brand-logo-wordmark-light">expo</span>
          <span className="brand-logo-wordmark-bold">vision AI</span>
        </span>
      ) : null}
      {showName && nameVariant === "academy" ? <span className="brand-logo-text">Expovision AI Academy</span> : null}
    </RootTag>
  );
}
