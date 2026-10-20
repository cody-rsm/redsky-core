import { Faculty_Glyphic, Fira_Mono, Fira_Sans } from 'next/font/google';

// The RSM brand faces (SPEC §2.2), self-hosted at build time so no request leaves RedSky for fonts.
export const displayFont = Faculty_Glyphic({ weight: '400', subsets: ['latin'], variable: '--rs-font-display', display: 'swap', fallback: ['Georgia', 'Times New Roman', 'serif'] });
export const sansFont = Fira_Sans({ weight: ['400', '500', '600'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--rs-font-sans', display: 'swap' });
export const monoFont = Fira_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--rs-font-mono', display: 'swap' });
