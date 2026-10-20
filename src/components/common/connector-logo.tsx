import type { CSSProperties } from 'react';

type LogoSource = { mono: string; tone: number; logo?: string };

type ConnectorLogoProps = {
  connector: LogoSource;
  // Omit to use the .lt default (40px) from the design system.
  size?: number;
  style?: CSSProperties;
};

export function ConnectorLogo({ connector, size, style }: ConnectorLogoProps) {
  const sizing: CSSProperties | undefined = size ? { width: size, height: size, fontSize: size <= 32 ? 11.5 : undefined } : undefined;
  if (connector.logo) {
    return (
      <span className="lt lt-logo" style={{ ...sizing, ...style }} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- static vendor SVG marks; next/image adds nothing for these */}
        <img src={connector.logo} alt="" />
      </span>
    );
  }
  return (
    <span className={`lt lt-${connector.tone}`} style={{ ...sizing, ...style }} aria-hidden="true">
      {connector.mono}
    </span>
  );
}
