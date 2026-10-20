import type { CSSProperties } from 'react';

type RedSkyMarkProps = {
  size?: number;
  className?: string;
  // The horizon line is omitted in the smallest placements (ready-screen preview rail), as in the prototype.
  withHorizon?: boolean;
  style?: CSSProperties;
};

// Original RedSky mark (SPEC §2.3): crimson badge echoing RSM's alternate logo, a Dust Cloud serif "R"
// above a thin Palomino horizon line. Never a replacement for the RSM Capital primary logo.
export function RedSkyMark({ size = 28, className, withHorizon = true, style }: RedSkyMarkProps) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className} style={{ width: size, height: size, flex: 'none', ...style }}>
      <RedSkyMarkPaths withHorizon={withHorizon} />
    </svg>
  );
}

export function RedSkyMarkPaths({ withHorizon = true }: { withHorizon?: boolean }) {
  return (
    <>
      <path d="M4 7.4 16 4l12 3.4v17.2L16 28 4 24.6z" fill="#941B1E" />
      <text
        x="16"
        y="20.6"
        textAnchor="middle"
        fontSize="15.5"
        fill="#EEEBDF"
        style={{ fontFamily: "var(--rs-font-display), 'Faculty Glyphic', Georgia, serif" }}
      >
        R
      </text>
      {withHorizon ? <path d="M9.5 23h13" stroke="#ECDCB9" strokeWidth="1" strokeLinecap="round" /> : null}
    </>
  );
}
