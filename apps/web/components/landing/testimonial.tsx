"use client"

import Image from "next/image"
import { useRef } from "react"
import { motion, useReducedMotion, useScroll, useTransform, type MotionValue } from "framer-motion"

const QUOTE =
  "Aurax revolutionized how we handle crypto trading with live order books. We are now executing better trades quicker than we ever imagined! Aurax revolutionized how we handle crypto trading with live order books."

function Word({ word, index, total, progress }: { word: string; index: number; total: number; progress: MotionValue<number> }) {
  const range: [number, number] = [index / total, (index + 1) / total]
  const opacity = useTransform(progress, range, [0.2, 1])
  const color = useTransform(progress, range, ["hsl(0 0% 35%)", "hsl(0 0% 100%)"])
  return (
    <motion.span style={{ opacity, color }} className="mr-[0.3em]">
      {word}
    </motion.span>
  )
}

export function Testimonial() {
  const containerRef = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start end", "end center"] })
  const words = QUOTE.split(" ")

  return (
    <section aria-label="What traders say" className="flex min-h-screen items-center px-8 py-24 md:px-28 md:py-32">
      <div ref={containerRef} className="mx-auto flex max-w-3xl flex-col items-start gap-10">
        <Image src="/brand/quote.svg" alt="" width={56} height={40} className="h-10 w-14 object-contain" />

        <blockquote className="flex flex-wrap text-4xl leading-[1.2] font-medium md:text-5xl">
          {reduce
            ? QUOTE
            : words.map((w, i) => <Word key={i} word={w} index={i} total={words.length} progress={scrollYProgress} />)}
          <span aria-hidden="true" className="ml-2 text-muted-foreground">
            &rdquo;
          </span>
        </blockquote>

        <figure className="flex items-center gap-4">
          <Image src="/brand/testimonial-avatar.svg" alt="" width={56} height={56} className="h-14 w-14 rounded-full border-[3px] border-foreground object-cover" />
          <figcaption>
            <p className="text-base leading-7 font-semibold text-foreground">Brooklyn Simmons</p>
            <p className="text-sm leading-5 font-normal text-muted-foreground">Product Manager</p>
          </figcaption>
        </figure>
      </div>
    </section>
  )
}
