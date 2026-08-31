'use client'
import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Download, Printer, RefreshCw } from 'lucide-react'

/**
 * De QR-payload zelf staat in Strapi als `container.qr_code_data`
 * ("CONTAINER:<uuid>", gezet door de container-lifecycle bij aanmaken). De
 * afbeelding is puur een weergave daarvan en wordt hier client-side gerenderd —
 * die hoeft dus niet apart opgeslagen te worden.
 */
export function ContainerQr({ code, waarde, onGenereer, bezig }: {
  code: string
  waarde?: string
  onGenereer?: () => void
  bezig?: boolean
}) {
  const [dataUrl, setDataUrl] = useState('')

  useEffect(() => {
    if (!waarde) { setDataUrl(''); return }
    let actief = true
    QRCode.toDataURL(waarde, { width: 512, margin: 1, color: { dark: '#111111', light: '#FFFFFF' } })
      .then(url => { if (actief) setDataUrl(url) })
      .catch(console.error)
    return () => { actief = false }
  }, [waarde])

  if (!waarde) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-line p-4">
        <p className="text-xs text-ink-subtle">Deze container heeft nog geen QR-code.</p>
        {onGenereer && (
          <button type="button" onClick={onGenereer} disabled={bezig}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-accent px-4 text-xs font-medium text-white transition-colors hover:bg-accent/90 disabled:opacity-60">
            <RefreshCw size={14} className={bezig ? 'animate-spin' : ''} /> QR-code genereren
          </button>
        )}
      </div>
    )
  }

  const bestandsnaam = `qr-${code || 'container'}.png`

  const print = () => {
    const w = window.open('', '_blank', 'width=420,height=560')
    if (!w) return
    w.document.write(`<!doctype html><title>${code}</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:32px}
      img{width:280px;height:280px}h1{font-size:20px;margin:16px 0 4px}
      p{font-size:11px;color:#666;word-break:break-all;margin:0}</style>
      <img src="${dataUrl}" alt="" onload="window.focus();window.print()">
      <h1>${code}</h1><p>${waarde}</p>`)
    // Printen pas na de img-onload, anders print Safari een lege pagina.
    w.document.close()
  }

  return (
    <div className="flex items-start gap-4 rounded-lg border border-line bg-surface p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {dataUrl && <img src={dataUrl} alt={`QR-code ${code}`} className="h-28 w-28 flex-shrink-0 rounded-lg bg-surface p-1.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold tracking-wide text-ink-subtle">QR-inhoud</p>
        <p className="mt-1 break-all font-mono text-xs text-ink-muted">{waarde}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={dataUrl} download={bestandsnaam}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fill px-4 text-xs font-medium text-ink transition-colors hover:bg-line hover:text-ink">
            <Download size={14} /> PNG
          </a>
          <button type="button" onClick={print}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-fill px-4 text-xs font-medium text-ink transition-colors hover:bg-line hover:text-ink">
            <Printer size={14} /> Printen
          </button>
        </div>
      </div>
    </div>
  )
}
