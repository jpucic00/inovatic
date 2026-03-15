import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Inovatic – Udruga za robotiku Split'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #ecfeff 0%, #ffffff 50%, #eff6ff 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Decorative circle top-right */}
        <div
          style={{
            position: 'absolute',
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(6, 182, 212, 0.15)',
          }}
        />
        {/* Decorative circle bottom-left */}
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -60,
            width: 300,
            height: 300,
            borderRadius: '50%',
            background: 'rgba(234, 179, 8, 0.12)',
          }}
        />

        {/* Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(6, 182, 212, 0.1)',
            border: '1px solid rgba(6, 182, 212, 0.3)',
            borderRadius: 100,
            padding: '8px 24px',
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 18, color: '#0891b2', fontWeight: 700, letterSpacing: 3 }}>
            SPLIT, HRVATSKA · OD 2014.
          </span>
        </div>

        {/* Main title */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: '#111827',
            textAlign: 'center',
            lineHeight: 1.1,
            marginBottom: 20,
            letterSpacing: -2,
          }}
        >
          <span style={{ color: '#06b6d4' }}>LEGO Robotika</span>
          <br />
          za djecu u Splitu
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 28,
            color: '#6b7280',
            textAlign: 'center',
            maxWidth: 800,
            lineHeight: 1.4,
          }}
        >
          Učimo djecu od 6 do 14 godina programiranje i robotiku
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            background: 'linear-gradient(90deg, #06b6d4, #0891b2)',
          }}
        />

        {/* Bottom branding */}
        <div
          style={{
            position: 'absolute',
            bottom: 30,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: '#0891b2' }}>udruga-inovatic.hr</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
