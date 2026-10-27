import qrcode from 'qrcode-generator'
import { useMemo } from 'react'

// QR code dessiné en SVG, à projeter ou à imprimer pour un atelier sur place.
export default function QrCode({ texte, titre, taille = 220 }: { texte: string; titre: string; taille?: number }) {
  const { n, chemin } = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(texte)
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x + 4} ${y + 4}h1v1h-1z`
    return { n, chemin: d }
  }, [texte])
  return (
    <svg role="img" aria-label={titre} viewBox={`0 0 ${n + 8} ${n + 8}`} width={taille} height={taille} shapeRendering="crispEdges" className="bg-white">
      <rect width={n + 8} height={n + 8} fill="#ffffff" />
      <path d={chemin} fill="#1A2332" />
    </svg>
  )
}
