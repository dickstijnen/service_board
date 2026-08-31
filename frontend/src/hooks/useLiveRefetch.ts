'use client'
import { useEffect, useRef } from 'react'

/**
 * Houdt het scherm in sync met de Strapi-backend zonder handmatig verversen.
 * Roept `laad` opnieuw aan:
 *   - wanneer het tabblad weer zichtbaar wordt (visibilitychange)
 *   - wanneer het venster focus krijgt (terug uit Strapi admin / ander tabblad)
 *   - elke `intervalMs` als het tabblad zichtbaar is (lichte polling)
 *
 * Zo zie je wijzigingen die in de Strapi-backend zijn gedaan vrijwel direct
 * terug aan de voorkant.
 *
 * BELANGRIJK: deze achtergrond-refetches roepen `laad(true)` aan — de `stil`-
 * vlag. De loader hoort dan géén laad-skeleton te tonen (dus geen `setLaden(true)`
 * en geen her-animatie), alleen de data stil te verversen. Anders knippert het
 * scherm elke 15s / bij elke tab-focus ("random refresh"). De eerste load en
 * navigatie/filterwissels roepen `laad()` zónder vlag aan en tonen wél de
 * skeleton.
 */
export function useLiveRefetch(laad: (stil?: boolean) => void, intervalMs = 15000) {
  const laadRef = useRef(laad)
  laadRef.current = laad

  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') laadRef.current(true) }
    const onVisible = () => { if (document.visibilityState === 'visible') laadRef.current(true) }

    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(refresh, intervalMs)

    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [intervalMs])
}
