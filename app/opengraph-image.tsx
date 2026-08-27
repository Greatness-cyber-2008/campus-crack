import { ImageResponse } from 'next/og';
export const runtime = 'edge';
export const alt = 'CampusCrack — AI Study App for Nigerian University Students';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export default async function Image() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#12172B' }}>
        <div style={{ display: 'flex', width: 220, height: 220, borderRadius: '9999px', border: '8px solid #E8B84B', color: '#E8B84B', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', transform: 'rotate(-8deg)', marginBottom: 40 }}>
          <div style={{ fontSize: 64, fontWeight: 900 }}>92%</div>
          <div style={{ fontSize: 20, letterSpacing: 4, marginTop: 8 }}>CRACKED</div>
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, color: '#F5F0E1', letterSpacing: -1 }}>CAMPUSCRACK</div>
        <div style={{ fontSize: 26, color: '#8B92A8', marginTop: 16 }}>Upload your notes. Walk in knowing you'll crack it.</div>
      </div>
    ),
    { ...size }
  );
}
