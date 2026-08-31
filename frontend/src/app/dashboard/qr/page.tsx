'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { apiGet } from '@/lib/api'
import { useReveal } from '@/hooks/useReveal'
import { PageHeader, Card, StatusBadge, FilterPills } from '@/components/dashboard/ui'
import { containerStatusKleur , formaatLabel } from '@/lib/format'
import { QrCode, Camera, Search, Package, MapPin, X, LocateFixed, Navigation, ChevronRight } from 'lucide-react'
import { ContainerModal, type ContainerRecord } from '@/components/dashboard/ContainerModal'

interface Container {
  id: number
  documentId?: string
  container_code?: string
  formaat?: string
  status?: string
  type_omschrijving?: string
  huidige_locatie_adres?: string
  opmerkingen?: string
  qr_code_data?: string
  locatie_lat?: number
  locatie_lng?: number
}

type Nabij = Container & { afstand: number }

/** Hemelsbrede afstand in km (haversine). */
function afstandKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLng = rad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

function toonAfstand(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}

type BarcodeDetectorResult = { rawValue: string }
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => {
  detect(video: HTMLVideoElement): Promise<BarcodeDetectorResult[]>
}

export default function QrPage() {
  const [code, setCode] = useState('')
  const [resultaat, setResultaat] = useState<Container | null>(null)
  const [fout, setFout] = useState('')
  const [zoekt, setZoekt] = useState(false)
  const [scant, setScant] = useState(false)
  const [modus, setModus] = useState<'scan' | 'dichtbij'>('scan')
  const [dichtbij, setDichtbij] = useState<Nabij[] | null>(null)
  const [zoektNabij, setZoektNabij] = useState(false)
  const [nabijFout, setNabijFout] = useState('')
  // Gevonden container openen in de detail/bewerk-modal (werkt ook voor
  // chauffeurs — die kunnen niet naar de containerpagina, maar wel scannen).
  const [bekijk, setBekijk] = useState<ContainerRecord | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopRef = useRef<number | null>(null)
  const zoekRef = useRef<(v: string) => void>(() => {})
  const scope = useReveal()

  const zoek = async (waarde: string) => {
    const q = waarde.trim()
    if (!q) return
    const bakCode = /^\d+$/.test(q) ? `BAK-${q.padStart(3, '0')}` : q
    setZoekt(true); setFout(''); setResultaat(null)
    // qr_code_data heeft formaat "CONTAINER:<uuid>"; sta ook losse code/uuid
    // en korte bakcodes toe ("005" vindt "BAK-005").
    const params = `filters[$or][0][qr_code_data][$eq]=${encodeURIComponent(q)}` +
      `&filters[$or][1][qr_code_data][$contains]=${encodeURIComponent(q)}` +
      `&filters[$or][2][container_code][$eq]=${encodeURIComponent(q)}` +
      `&filters[$or][3][container_code][$eq]=${encodeURIComponent(bakCode)}` +
      `&filters[$or][4][container_code][$containsi]=${encodeURIComponent(q)}`
    try {
      const r = await apiGet<{ data: Container[] }>(`containers?${params}&pagination[limit]=1`)
      if (r.data?.length) setResultaat(r.data[0])
      else setFout(`Geen container gevonden voor "${q}"`)
    } catch (e) {
      console.error(e); setFout('Zoeken mislukt')
    } finally {
      setZoekt(false)
    }
  }

  // Containers in de buurt: eigen GPS ophalen, alle containers mét coördinaten
  // laden en op hemelsbrede afstand sorteren.
  const zoekDichtbij = () => {
    if (!navigator.geolocation) { setNabijFout('Deze browser ondersteunt geen locatiebepaling'); return }
    setZoektNabij(true); setNabijFout(''); setDichtbij(null)

    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude, longitude } = pos.coords
        try {
          const r = await apiGet<{ data: Container[] }>(
            'containers?pagination[limit]=200&filters[locatie_lat][$notNull]=true&filters[locatie_lng][$notNull]=true'
          )
          const lijst = (r.data ?? [])
            .filter(c => c.locatie_lat != null && c.locatie_lng != null)
            .map(c => ({ ...c, afstand: afstandKm(latitude, longitude, Number(c.locatie_lat), Number(c.locatie_lng)) }))
            .sort((a, b) => a.afstand - b.afstand)
            .slice(0, 3)
          setDichtbij(lijst)
          if (lijst.length === 0) setNabijFout('Geen containers met een bekende locatie')
        } catch (e) {
          console.error(e); setNabijFout('Containers ophalen mislukt')
        } finally {
          setZoektNabij(false)
        }
      },
      err => {
        console.error(err)
        setZoektNabij(false)
        setNabijFout(err.code === err.PERMISSION_DENIED
          ? 'Geen toestemming voor je locatie — sta dit toe in je browser'
          : 'Je locatie kon niet worden bepaald')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  // zoek() verandert elke render; via een ref kan de scanlus 'm aanroepen
  // zonder dat de lus-effect opnieuw hoeft te draaien.
  zoekRef.current = zoek

  const stopScan = useCallback(() => {
    if (loopRef.current) { cancelAnimationFrame(loopRef.current); loopRef.current = null }
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setScant(false)
  }, [])

  // Wisselen tussen scannen en zoeken op afstand. De camera gaat uit zodra je
  // naar 'dichtbij' schakelt, anders blijft de stream onnodig openstaan.
  const kiesModus = (m: 'scan' | 'dichtbij') => {
    if (m === modus) return
    if (m === 'dichtbij') stopScan()
    setFout(''); setNabijFout('')
    setModus(m)
  }

  const startScan = async () => {
    setFout('')
    // getUserMedia bestaat alleen in een secure context: https of localhost.
    // Op een LAN-adres (http://192.168.x.x) is navigator.mediaDevices undefined.
    if (!navigator.mediaDevices?.getUserMedia) {
      setFout(window.isSecureContext
        ? 'Deze browser geeft geen toegang tot de camera. Gebruik handmatige invoer.'
        : 'Camera werkt alleen via https of localhost. Open het dashboard op een https-adres.')
      return
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      })
      setScant(true)
    } catch (e: unknown) {
      const naam = e instanceof DOMException ? e.name : ''
      setFout(
        naam === 'NotAllowedError' ? 'Geen toestemming voor de camera — sta dit toe in je browser.'
          : naam === 'NotFoundError' ? 'Geen camera gevonden op dit apparaat.'
            : naam === 'NotReadableError' ? 'De camera is al in gebruik door een andere app.'
              : 'Geen toegang tot camera.'
      )
      setScant(false)
    }
  }

  // Stream pas koppelen als het <video>-element daadwerkelijk in de DOM staat.
  // Dat is één render ná setScant(true) — vandaar een effect en niet inline.
  useEffect(() => {
    const video = videoRef.current
    const stream = streamRef.current
    if (!scant || !video || !stream) return

    let gestopt = false
    video.srcObject = stream
    video.play().catch(console.error)

    // BarcodeDetector (Chromium) is het snelst; jsQR is de fallback voor Safari
    // en Firefox, die de API niet hebben.
    const Detector = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector
    const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null

    const gevonden = (waarde: string) => {
      gestopt = true
      stopScan()
      setCode(waarde)
      zoekRef.current(waarde)
    }

    const viaCanvas = () => {
      if (!video.videoWidth) return null
      const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'))
      // Halve resolutie: scheelt flink rekenwerk en jsQR leest het prima.
      canvas.width = Math.round(video.videoWidth / 2)
      canvas.height = Math.round(video.videoHeight / 2)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return null
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const beeld = ctx.getImageData(0, 0, canvas.width, canvas.height)
      return jsQR(beeld.data, beeld.width, beeld.height, { inversionAttempts: 'dontInvert' })?.data ?? null
    }

    let vorige = 0
    const tick = async (nu: number) => {
      if (gestopt) return
      // ~8 scans per seconde is ruim genoeg en houdt de telefoon koel.
      if (nu - vorige > 120) {
        vorige = nu
        try {
          if (detector) {
            const codes = await detector.detect(video)
            if (codes.length > 0) return gevonden(codes[0].rawValue)
          } else {
            const waarde = viaCanvas()
            if (waarde) return gevonden(waarde)
          }
        } catch { /* frame overslaan */ }
      }
      loopRef.current = requestAnimationFrame(tick)
    }
    loopRef.current = requestAnimationFrame(tick)

    return () => {
      gestopt = true
      if (loopRef.current) { cancelAnimationFrame(loopRef.current); loopRef.current = null }
    }
  }, [scant, stopScan])

  useEffect(() => stopScan, [stopScan])

  return (
    <div ref={scope} data-reveal className="p-4 sm:p-6 lg:p-8 max-w-2xl">
      <PageHeader titel="QR Scanner" sub="Scan of zoek een container" />

      <Card className="p-6 mb-6">
        <form onSubmit={e => { e.preventDefault(); zoek(code) }} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <QrCode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={code}
              onChange={e => setCode(e.target.value)}
              placeholder="Containercode of QR-data..."
              className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-surface border border-line text-sm text-ink placeholder:text-ink-subtle outline-none focus:border-accent/40"
            />
          </div>
          <button type="submit" disabled={zoekt} className="px-4 py-2.5 rounded-lg bg-accent hover:bg-accent/90 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
            <Search size={15} /> {zoekt ? 'Zoeken...' : 'Zoek'}
          </button>
        </form>

        <FilterPills
          actief={modus}
          onKies={v => kiesModus(v as 'scan' | 'dichtbij')}
          opties={[
            { value: 'scan', label: 'Camera scannen' },
            { value: 'dichtbij', label: 'Bij mij in de buurt' },
          ]}
        />

        {modus === 'scan' ? (
          <div className="mt-4">
            {scant ? (
              <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                <div className="pointer-events-none absolute inset-0 m-12 rounded-xl border-2 border-accent/50" />
                <button onClick={stopScan} className="absolute right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-ink">
                  <X size={16} />
                </button>
              </div>
            ) : (
              <button onClick={startScan} className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-3 text-sm text-ink-muted transition-colors hover:border-line hover:text-ink">
                <Camera size={16} /> Camera starten
              </button>
            )}
          </div>
        ) : (
          <div className="mt-4">
            {dichtbij && dichtbij.length > 0 ? (
              <div className="overflow-hidden rounded-xl border border-line divide-y divide-line">
                {dichtbij.map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="w-16 flex-shrink-0 font-mono text-sm font-semibold text-accent">{toonAfstand(c.afstand)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-sm text-ink">{c.container_code}</div>
                      <div className="truncate text-xs text-ink-subtle">{c.huidige_locatie_adres ?? 'Geen adres bekend'}</div>
                    </div>
                    <StatusBadge status={c.status ?? ''} kleur={containerStatusKleur} />
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${c.locatie_lat},${c.locatie_lng}`}
                      target="_blank" rel="noopener noreferrer"
                      title="Route in Google Maps"
                      className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-fill hover:text-accent"
                    >
                      <Navigation size={15} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <button onClick={zoekDichtbij} disabled={zoektNabij}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-line py-3 text-sm text-ink-muted transition-colors hover:border-line hover:text-ink disabled:opacity-60">
                <LocateFixed size={16} className={zoektNabij ? 'animate-pulse' : ''} />
                {zoektNabij ? 'Locatie bepalen...' : 'Mijn locatie gebruiken'}
              </button>
            )}
            {dichtbij && dichtbij.length > 0 && (
              <button onClick={zoekDichtbij} disabled={zoektNabij}
                className="mt-2 flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-xs text-ink-subtle transition-colors hover:text-ink-muted disabled:opacity-60">
                <LocateFixed size={14} className={zoektNabij ? 'animate-pulse' : ''} /> Opnieuw zoeken
              </button>
            )}
          </div>
        )}

        {fout && <p className="text-sm text-danger mt-4">{fout}</p>}
        {nabijFout && <p className="text-sm text-danger mt-4">{nabijFout}</p>}
      </Card>

      {resultaat && (
        // Klikbaar: opent de container in de detail/bewerk-modal.
        <button
          type="button"
          onClick={() => setBekijk(resultaat)}
          className="w-full text-left"
        >
          <Card className="p-6 transition-colors hover:border-line active:bg-fill">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-accent/15 text-accent flex items-center justify-center">
                  <Package size={20} />
                </div>
                <div>
                  <div className="text-lg font-mono text-ink">{resultaat.container_code}</div>
                  <div className="text-sm text-ink-subtle">{resultaat.type_omschrijving ?? formaatLabel(resultaat.formaat)}</div>
                </div>
              </div>
              <StatusBadge status={resultaat.status ?? ''} kleur={containerStatusKleur} />
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-ink-muted">
                <MapPin size={14} className="text-ink-subtle" />
                {resultaat.huidige_locatie_adres ?? 'Geen locatie bekend'}
              </div>
              <div className="text-xs text-ink-subtle">Formaat: {formaatLabel(resultaat.formaat)}</div>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-medium text-accent">
              Bekijken <ChevronRight size={14} />
            </div>
          </Card>
        </button>
      )}

      <ContainerModal
        open={!!bekijk}
        onClose={() => setBekijk(null)}
        onSaved={() => { setBekijk(null); if (resultaat?.container_code) zoek(resultaat.container_code) }}
        container={bekijk}
      />
    </div>
  )
}
