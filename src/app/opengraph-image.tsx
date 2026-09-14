import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          padding: '72px',
          background: '#111827',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontSize: 28, opacity: 0.75 }}>Professionelle Zusammenarbeit</div>
        <div style={{ fontSize: 76, fontWeight: 700, marginTop: 18 }}>Orgaplattform</div>
        <div style={{ fontSize: 34, marginTop: 22, opacity: 0.9 }}>Boards · Aufgaben · Team</div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
