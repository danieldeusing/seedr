import { useEffect } from "react";

/*
 * Live terminal session: `$ command` prompts type out,
 * then their section's `[data-term-out]` content reveals like command output.
 * Sections play sequentially in trigger order; sections below the viewport
 * play when scrolled in. The html.term-anim gate is set pre-paint in
 * index.html; this hook only drives the animation.
 *
 * `subject` identifies the rendered data (e.g. the registry item): the session
 * replays from the top when it changes and never starts while it is missing.
 * Each run first resets animation state — React reuses DOM nodes across
 * client-side navigations, so leftover term-live/term-show classes from the
 * previous item must not suppress the replay.
 */
export function useTerminalSession(subject: unknown) {
  useEffect(() => {
    if (subject == null) return;
    if (!document.documentElement.classList.contains("term-anim")) return;

    document.querySelectorAll<HTMLElement>("[data-term] .prompt").forEach(prompt => {
      prompt.querySelector(".term-caret")?.remove();
      if (prompt.dataset.termText) prompt.textContent = prompt.dataset.termText;
      prompt.classList.remove("term-live");
    });
    document
      .querySelectorAll("[data-term] [data-term-out].term-show")
      .forEach(chunk => chunk.classList.remove("term-show"));

    let cancelled = false;
    const timeouts = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
    };

    const typePrompt = (prompt: HTMLElement) =>
      new Promise<void>(finished => {
        const text = (prompt.textContent || "").trim();
        prompt.dataset.termText = text;
        const typedText = document.createTextNode("");
        const caret = document.createElement("span");
        caret.className = "term-caret";
        caret.setAttribute("aria-hidden", "true");
        prompt.textContent = "";
        prompt.classList.add("term-live");
        prompt.append(typedText, caret);
        // ~30ms per character, capped so long commands finish within ~550ms
        const perCharMs = Math.min(30, 550 / Math.max(text.length, 1));
        let typedCount = 0;
        const typeNext = () => {
          if (typedCount < text.length) {
            typedCount += 1;
            typedText.data = text.slice(0, typedCount);
            schedule(typeNext, perCharMs * (0.75 + Math.random() * 0.5));
          } else {
            caret.remove();
            finished();
          }
        };
        typeNext();
      });

    // command "execution" latency between the typed prompt and its output
    const OUTPUT_DELAY_MS = 220;

    const revealOutputs = (section: HTMLElement, instant: boolean) =>
      new Promise<void>(finished => {
        const chunks = section.querySelectorAll("[data-term-out]:not(.term-show)");
        const stagger = (index: number) => Math.min(index * 140, 560);
        chunks.forEach((chunk, index) => {
          if (instant) chunk.classList.add("term-show");
          else schedule(() => chunk.classList.add("term-show"), stagger(index));
        });
        if (instant || chunks.length === 0) finished();
        else schedule(finished, stagger(chunks.length - 1) + 250);
      });

    const pause = (ms: number) => new Promise<void>(resolve => schedule(resolve, ms));

    // degenerate contexts (zero-height embeds) report innerHeight 0 — treat
    // the viewport as unbounded there so every section still plays
    const viewportHeight = () => window.innerHeight || Number.POSITIVE_INFINITY;

    const playSection = async (section: HTMLElement) => {
      if (cancelled) return;
      const rect = section.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > viewportHeight();
      const prompt = section.querySelector<HTMLElement>(".prompt:not(.term-live)");
      if (prompt) {
        if (offscreen) prompt.classList.add("term-live");
        else {
          await typePrompt(prompt);
          await pause(OUTPUT_DELAY_MS);
        }
      }
      await revealOutputs(section, offscreen);
    };

    // sections play one after another, in the order they were triggered
    let sequence = Promise.resolve();
    const enqueue = (section: HTMLElement) => {
      sequence = sequence.then(() => playSection(section));
    };

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            observer.unobserve(entry.target);
            enqueue(entry.target as HTMLElement);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px" }
    );

    document.querySelectorAll<HTMLElement>("[data-term]").forEach(section => {
      // in or above the viewport: part of the load sequence (playSection
      // reveals already-passed sections instantly); below: animate on scroll-in
      if (section.getBoundingClientRect().top < viewportHeight()) enqueue(section);
      else observer.observe(section);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      timeouts.forEach(clearTimeout);
      // finish any half-typed prompt so an interrupted run never leaves a stub
      document.querySelectorAll<HTMLElement>("[data-term] .prompt.term-live").forEach(prompt => {
        if (prompt.querySelector(".term-caret") && prompt.dataset.termText) {
          prompt.textContent = prompt.dataset.termText;
        }
      });
    };
  }, [subject]);
}
