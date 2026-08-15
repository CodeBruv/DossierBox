/**
 * Button — presentational primitive.
 *
 * Variants:
 *   - primary:   filled accent (main CTA / entry points)
 *   - secondary: outlined neutral
 *   - tertiary:  text-only
 *
 * `asChild` allows rendering the button styles on another element
 * (e.g. an <a> used as a styled link). This is purely presentational;
 * no business logic lives here.
 */
import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import styles from "@/styles/ui/button.module.css";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary" | "tertiary";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
  children?: ReactNode;
}

type AsChildProps = {
  className?: string;
  disabled?: boolean;
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  asChild = false,
  ...rest
}: ButtonProps): ReactElement {
  const sharedClassName = cx(
    styles.btn,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    { [styles.disabled]: Boolean(disabled) },
    className
  );

  if (asChild && isValidElement<AsChildProps>(children)) {
    return cloneElement(children, {
      className: cx(sharedClassName, children.props.className),
      disabled,
      ...rest,
    });
  }

  return (
    <button className={sharedClassName} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}