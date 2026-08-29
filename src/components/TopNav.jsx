import { motion } from 'framer-motion'
import { Compass, FolderOpen, MapPinned, Menu, PlayCircle, Wallet } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../lib/i18n.js'

const VIEWS = [
  { id: 'plan', key: 'nav.plan', icon: MapPinned },
  { id: 'view', key: 'nav.view', icon: PlayCircle },
  { id: 'details', key: 'nav.details', icon: FolderOpen },
  { id: 'budget', key: 'nav.budget', icon: Wallet },
  { id: 'discover', key: 'nav.discover', icon: Compass },
]

// How far you must scroll back up (in px) after a collapse before the bar
// re-expands. Small enough to feel responsive, large enough that a jittery
// scroll doesn't flip it open and shut.
const EXPAND_SCROLL_THRESHOLD = 80

// Motion below 150px from the top never collapses — the bar is fully visible
// there anyway and collapsing at rest looks like a glitch.
const COLLAPSE_AFTER = 150

const containerVariants = {
  expanded: {
    y: 0,
    opacity: 1,
    width: 'auto',
    transition: { type: 'spring', damping: 20, stiffness: 300, staggerChildren: 0.07, delayChildren: 0.2 },
  },
  collapsed: {
    y: 0,
    opacity: 1,
    width: '2.25rem',
    transition: { type: 'spring', damping: 20, stiffness: 300, when: 'afterChildren', staggerChildren: 0.05, staggerDirection: -1 },
  },
}

const logoVariants = {
  expanded: { opacity: 1, x: 0, rotate: 0, transition: { type: 'spring', damping: 15 } },
  collapsed: { opacity: 0, rotate: -180, transition: { duration: 0.3 } },
}

const itemVariants = {
  expanded: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 15 } },
  collapsed: { opacity: 0, scale: 0.95, transition: { duration: 0.2 } },
}

const collapsedIconVariants = {
  expanded: { opacity: 0, scale: 0.8, transition: { duration: 0.2 } },
  collapsed: { opacity: 1, scale: 1, transition: { type: 'spring', damping: 15, stiffness: 300, delay: 0.15 } },
}

/**
 * Floating top navigation.
 *
 * Full pill at rest; collapses to a circle (Menu icon) once you scroll the
 * content down, and re-expands when you scroll back up or tap it. Only the
 * current view carries its label — the rest stay icons, which keeps the bar
 * narrow enough to survive a 375px phone.
 *
 * The app scrolls inside an inner overflow container, not the window, so the
 * collapse is driven off that element's scroll. `scrollContainer` is the DOM
 * node itself (App passes it via a callback ref held in state), so the effect
 * below re-runs and attaches its listener the moment the node mounts.
 */
export default function TopNav({ active, onChange, scrollContainer }) {
  const { t } = useI18n()
  const [isExpanded, setExpanded] = useState(true)

  const lastScrollY = useRef(0)
  const scrollAtCollapse = useRef(0)

  // Listen directly on the content pane's scroll (it's an inner overflow
  // container, not the window). framer's useScroll({ container }) proved
  // unreliable at picking up this ref, so a plain listener does the job.
  useEffect(() => {
    const el = scrollContainer
    if (!el) return

    const onScroll = () => {
      const latest = el.scrollTop
      const previous = lastScrollY.current

      if (isExpanded && latest > previous && latest > COLLAPSE_AFTER) {
        setExpanded(false)
        scrollAtCollapse.current = latest
      } else if (
        !isExpanded &&
        latest < previous &&
        scrollAtCollapse.current - latest > EXPAND_SCROLL_THRESHOLD
      ) {
        setExpanded(true)
      }

      lastScrollY.current = latest
    }

    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isExpanded, scrollContainer])

  const state = isExpanded ? 'expanded' : 'collapsed'

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[1000] flex justify-center px-3">
      <motion.nav
        aria-label={t('nav.main')}
        initial={{ y: -80, opacity: 0 }}
        animate={state}
        variants={containerVariants}
        whileHover={!isExpanded ? { scale: 1.08 } : undefined}
        whileTap={!isExpanded ? { scale: 0.95 } : undefined}
        onClick={() => !isExpanded && setExpanded(true)}
        className={`nav-bar pointer-events-auto relative flex h-9 items-center overflow-hidden rounded-full ${
          isExpanded ? 'px-1' : 'cursor-pointer justify-center'
        }`}
      >
        <motion.span variants={logoVariants} className="flex shrink-0 items-center ps-2 pe-0.5 text-accent">
          <Compass size={17} strokeWidth={2.2} />
        </motion.span>

        <motion.ul
          className={`flex items-center gap-0.5 ${!isExpanded ? 'pointer-events-none' : ''}`}
        >
          {VIEWS.map(({ id, key, icon: Icon }) => {
            const isActive = active === id
            const label = t(key)

            return (
              <motion.li key={id} variants={itemVariants}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onChange(id)
                  }}
                  aria-current={isActive ? 'page' : undefined}
                  title={label}
                  className={`flex items-center rounded-full text-[13px] font-semibold transition-all duration-300
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      isActive ? 'nav-pill-active gap-1.5 px-2.5 py-1.5' : 'nav-item-idle gap-0 px-2 py-1.5'
                    }`}
                >
                  <Icon size={17} strokeWidth={2.1} className="shrink-0" />
                  <span
                    className={`grid transition-all duration-300 ${
                      isActive ? 'grid-cols-[1fr] opacity-100' : 'grid-cols-[0fr] opacity-0'
                    }`}
                  >
                    <span className="overflow-hidden whitespace-nowrap">{label}</span>
                  </span>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>

        {/* Collapsed-state icon, centred over the circle. */}
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <motion.span variants={collapsedIconVariants} animate={state} className="text-fg">
            <Menu size={18} />
          </motion.span>
        </span>
      </motion.nav>
    </div>
  )
}
