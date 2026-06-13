import type { HTMLAttributes, ReactNode } from "react";
import type { ComponentType as ItemType } from "@/lib/types";
import { typeBorderColors } from "@/lib/colors";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  hover?: boolean;
  typeIndicator?: ItemType;
}

export function Card({
  children,
  className = "",
  hover = true,
  typeIndicator,
  ...props
}: CardProps) {
  const hoverStyles = hover ? "hover:bg-active hover:border-overlay-hover" : "";
  const typeStyles = typeIndicator
    ? `border-l-4 ${typeBorderColors[typeIndicator]}`
    : "";

  return (
    <div
      className={`bg-surface border border-overlay p-3 transition-colors ${hoverStyles} ${typeStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
