import type { CSSProperties } from 'react';
import styles from './Photo.module.css';

type PhotoProps = {
  /** when absent, the striped placeholder is drawn instead */
  src?: string;
  alt: string;
  caption?: string;
  /** 1-based, drives the "PHOTO 01" label on the placeholder */
  index?: number;
  height?: number | string;
  className?: string;
  frameClassName?: string;
  style?: CSSProperties;
};

export function Photo({
  src,
  alt,
  caption,
  index = 1,
  height,
  className,
  frameClassName,
  style,
}: PhotoProps) {
  const frameStyle: CSSProperties = height === undefined ? {} : { height };

  return (
    <figure className={[styles.figure, className].filter(Boolean).join(' ')} style={style}>
      <div
        className={[styles.frame, frameClassName].filter(Boolean).join(' ')}
        style={frameStyle}
      >
        {src ? (
          <img className={styles.img} src={src} alt={alt} loading="lazy" />
        ) : (
          <span className={styles.placeholder} role="img" aria-label={alt}>
            <span className={styles.tag} aria-hidden="true">
              PHOTO {String(index).padStart(2, '0')}
            </span>
          </span>
        )}
      </div>
      {caption ? <figcaption className={styles.caption}>{caption}</figcaption> : null}
    </figure>
  );
}
