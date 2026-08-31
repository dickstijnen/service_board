'use client'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/lib/gsap-config'

/**
 * Subtiele entree-animatie voor dashboardpagina's.
 *
 * De scope-container is via CSS (`[data-reveal] { visibility: hidden }`) vooraf
 * verborgen, zodat er geen "flash of unstyled content" is voordat GSAP draait.
 * useGSAP draait in een layout-effect (vóór paint): we maken de container zichtbaar,
 * parkeren de kinderen eerst met `autoAlpha: 0` en animeren ze naar hun natuurlijke staat.
 *
 * Animeert [data-anim]-elementen binnen de scope; zonder markers de directe kinderen.
 * Een `laden`-dep houdt de eerste paint verborgen tot de echte content klaar is;
 * daarna draait de page-wide reveal niet opnieuw bij tabs, clicks of live-refetches.
 * Respecteert prefers-reduced-motion.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(dep?: unknown) {
  const scope = useRef<T>(null)
  const hasRevealed = useRef(false)

  useGSAP(() => {
    const root = scope.current
    if (!root) return

    // Container altijd zichtbaar maken (buiten de tween, zodat het niet wordt teruggedraaid).
    root.style.visibility = 'visible'

    const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const marked = root.querySelectorAll('[data-anim]')
    const targets: ArrayLike<Element> = marked.length ? marked : root.children
    if (!targets || targets.length === 0) return

    // Eventuele nog lopende tween op deze targets eerst stoppen, zodat een
    // afgebroken animatie nooit blijft hangen op een tussenwaarde.
    gsap.killTweensOf(targets)

    if (reduce) {
      gsap.set(targets, { autoAlpha: 1, y: 0, filter: 'blur(0px)' })
      hasRevealed.current = true
      return
    }

    const depString = typeof dep === 'string' ? dep : ''
    const isLoading = dep === false || depString.includes('laden')

    if (isLoading) {
      if (!hasRevealed.current) {
        gsap.set(targets, { autoAlpha: 0, y: 0, filter: 'blur(6px)' })
      } else {
        gsap.set(targets, { autoAlpha: 1, y: 0, filter: 'blur(0px)' })
      }
      return
    }

    if (hasRevealed.current) {
      gsap.set(targets, { autoAlpha: 1, y: 0, filter: 'blur(0px)' })
      return
    }

    // fromTo met EXPLICIETE eindwaarden (niet from(), dat leest het eind live uit
    // en kan een halve staat als eindpunt pakken).
    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 0 },
      {
        autoAlpha: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 1.1,
        ease: 'power4.inOut',
        stagger: 0.09,
        onComplete: () => { hasRevealed.current = true },
      }
    )
  }, { scope, dependencies: [dep] })

  return scope
}
