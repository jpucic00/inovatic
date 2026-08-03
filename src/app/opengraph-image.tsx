import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Inovatic – LEGO Robotika za djecu'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  // Read the lockup out of public/ at build/render time. `new URL(…,
  // import.meta.url)` is what keeps this working on the edge runtime, where
  // there is no fs — Next traces the asset and inlines it.
  const logo = await fetch(
    new URL('../../public/images/logo_dark.png', import.meta.url),
  ).then((res) => res.arrayBuffer())

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
            background: 'rgba(75, 189, 202, 0.15)',
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

        {/* Logo lockup — the share preview's primary identifier */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // Satori accepts the raw ArrayBuffer here; the DOM typing does not.
          src={logo as unknown as string}
          alt=""
          width={520}
          height={297}
          style={{ marginBottom: 28 }}
        />

        {/* Headline — the logo says who, this says what */}
        <div
          style={{
            display: 'flex',
            fontSize: 52,
            fontWeight: 900,
            color: '#111827',
            textAlign: 'center',
            letterSpacing: -1.5,
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#4BBDCA' }}>LEGO Robotika&nbsp;</span>
          <span>za djecu</span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            fontSize: 26,
            color: '#6b7280',
            textAlign: 'center',
            maxWidth: 820,
            lineHeight: 1.4,
            marginBottom: 22,
          }}
        >
          Učimo djecu od 6 do 14 godina programiranje i robotiku
        </div>

        {/* Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(75, 189, 202, 0.1)',
            border: '1px solid rgba(75, 189, 202, 0.3)',
            borderRadius: 100,
            padding: '8px 24px',
          }}
        >
          <span style={{ fontSize: 18, color: '#2A9EAD', fontWeight: 700, letterSpacing: 3 }}>
            SPLIT · ŠIBENIK · OD 2014.
          </span>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 8,
            background: 'linear-gradient(90deg, #4BBDCA, #2A9EAD)',
          }}
        />

        {/* Bottom branding */}
        <div
          style={{
            position: 'absolute',
            bottom: 26,
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 22, fontWeight: 800, color: '#2A9EAD' }}>udruga-inovatic.hr</span>
        </div>
      </div>
    ),
    { ...size },
  )
}
