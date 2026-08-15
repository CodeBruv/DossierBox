/**
 * Container — centered page-width wrapper.
 *
 * A thin layout primitive. `wide` opts into the larger max-width for
 * pages that need fuller horizontal spread (e.g. a document preview).
 */
import styles from "@/styles/ui/container.module.css";
import { cx } from "@/lib/cx";
import type { ReactNode } from "react";

export interface ContainerProps {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}

export function Container({ children, className, wide = false }: ContainerProps) {
  return (
    <div
      className={cx(styles.container, { [styles.wide]: wide }, className)}
    >
      {children}
    </div>
  );
}
