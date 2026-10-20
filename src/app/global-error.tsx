'use client';

// Last-resort boundary: the root layout itself failed, so this renders its own document.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0, background: '#F7F5EF', color: '#1E1916' }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <h1 style={{ fontSize: 22, fontWeight: 600 }}>RedSky hit an unexpected error</h1>
          <p style={{ color: '#5C534D' }}>Nothing you saved was lost. Try again, and contact the RedSky team if it keeps happening.</p>
          <button type="button" onClick={reset} style={{ height: 36, padding: '0 14px', borderRadius: 7, border: 'none', background: '#941B1E', color: '#fff', cursor: 'pointer' }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
