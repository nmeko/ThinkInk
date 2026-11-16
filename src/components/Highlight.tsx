import { motion, useReducedMotion } from "motion/react"

/**
 * The highlighter stroke behind the selected item. Items sharing a `group` pass one stroke
 * between them, so it slides to whatever you pick; it draws itself in the first time.
 */
export function Highlight({ group }: { group: string }) {
  const still = useReducedMotion()
  return (
    <motion.span
      className="hl-swipe"
      aria-hidden="true"
      layoutId={still ? undefined : group}
      initial={still ? false : { scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ type: "spring", stiffness: 520, damping: 38 }}
    />
  )
}
