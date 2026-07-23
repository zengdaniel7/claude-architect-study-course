import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  kind = "secondary",
  icon,
  className = "",
  type = "button",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; icon?: ReactNode }) {
  return (
    <button type={type} className={`button button--${kind} ${className}`.trim()} {...props}>
      {icon ? <span className="button__icon" aria-hidden="true">{icon}</span> : null}
      <span>{children}</span>
    </button>
  );
}
