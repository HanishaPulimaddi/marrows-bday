import type { ElementType, ReactNode, CSSProperties } from 'react';
import styles from './Label.module.css';

type LabelProps = {
  children: ReactNode;
  /** 11px/.3em by default, 10px/.34em when small */
  small?: boolean;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** cream at this alpha - the design uses 40-60% */
  opacity?: number;
};

/** Every small caps label on the site. Always mono, always uppercase. */
export function Label({
  children,
  small = false,
  as: Tag = 'span',
  className,
  style,
  opacity,
  ...rest
}: LabelProps) {
  return (
    <Tag
      className={[styles.label, small ? styles.sm : '', className].filter(Boolean).join(' ')}
      style={opacity === undefined ? style : { opacity, ...style }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
