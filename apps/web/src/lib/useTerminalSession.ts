import { useEffect } from "react";

/*
 * Live terminal session (ported from pagr): `$ command` prompts type out,
 * then their section's `[data-term-out]` content reveals like command output.
 * Sections play sequentially in trigger order; sections below the viewport
 * play when scrolled in. The html.term-anim gate is set pre-paint in
 * index.html; this hook only drives the animation.
 *
 * Idempotency guards (.term-live / .term-show checks) make re-runs safe:
 * StrictMode double-mounts and route changes re-animate only untouched nodes.
 *
 * `subject` is the rendered data (e.g. the registry item): the session replays
 * when it changes and never starts while it is missing.
 */
export function useTerminalSession(subject: unknown) {
  useEffect(() => {
    if (subject == null) return;
    if (!document.documentElement.classList.contains("term-anim")) return;

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
        // ~35ms per character, capped so long commands finish within ~700ms
        const perCharMs = Math.min(38, 700 / Math.max(text.length, 1));
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

    const revealOutputs = (section: HTMLElement, instant: boolean) =>
      new Promise<void>(finished => {
        const chunks = section.querySelectorAll("[data-term-out]:not(.term-show)");
        const stagger = (index: number) => Math.min(index * 70, 280);
        chunks.forEach((chunk, index) => {
          if (instant) chunk.classList.add("term-show");
          else schedule(() => chunk.classList.add("term-show"), stagger(index));
        });
        if (instant || chunks.length === 0) finished();
        else schedule(finished, stagger(chunks.length - 1) + 200);
      });

    const playSection = async (section: HTMLElement) => {
      if (cancelled) return;
      const rect = section.getBoundingClientRect();
      const offscreen = rect.bottom < 0 || rect.top > window.innerHeight;
      const prompt = section.querySelector<HTMLElement>(".prompt:not(.term-live)");
      if (prompt) {
        if (offscreen) prompt.classList.add("term-live");
        else await typePrompt(prompt);
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
      if (section.getBoundingClientRect().top < window.innerHeight) enqueue(section);
      else observer.observe(section);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      timeouts.forEach(clearTimeout);
      // finish any half-typed prompt and unveil pending output so an
      // interrupted run (StrictMode, fast navigation) never leaves blanks
      document.querySelectorAll<HTMLElement>("[data-term] .prompt.term-live").forEach(prompt => {
        if (prompt.querySelector(".term-caret") && prompt.dataset.termText) {
          prompt.textContent = prompt.dataset.termText;
        }
      });
      document.querySelectorAll("[data-term] [data-term-out]:not(.term-show)").forEach(chunk => {
        const section = chunk.closest("[data-term]");
        if (section?.querySelector(".term-live")) chunk.classList.add("term-show");
      });
    };
  }, [subject]);
}
