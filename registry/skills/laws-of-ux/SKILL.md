---
name: laws-of-ux
description: |
  Apply established UX psychology laws when building or modifying user interfaces.
  ALWAYS use this skill when: creating new UI components or elements, moving or repositioning
  elements, changing layouts or navigation, modifying visual hierarchy or grouping, adding
  or removing interactive elements, changing form flows, redesigning screens, working on
  any frontend task that affects how users perceive, navigate, or interact with the interface.
  Also trigger when the user mentions "UX", "usability", "user experience", "interaction design",
  "UI best practices", or asks about element placement, spacing, grouping, or visual hierarchy.
  This skill applies to both user experience AND developer experience (DX) — developer tools,
  dashboards, and config UIs benefit from the same principles.
---

# Laws of UX

30 psychology-backed principles for building better interfaces. Based on [lawsofux.com](https://lawsofux.com) by Jon Yablonski.

## When to apply

After making a UI change, check the mapping table below to find which laws are relevant. Not every law applies to every change — focus on the ones that match your specific task. When you find a potential violation, reference the law by name so the user understands the reasoning behind any suggestion.

## Change type → Relevant laws

| What you're changing | Check these laws |
|---|---|
| Adding/removing options or menu items | Hick's Law, Choice Overload, Miller's Law |
| Moving or repositioning elements | Fitts's Law, Law of Proximity, Serial Position Effect |
| Grouping or separating elements | Law of Common Region, Law of Proximity, Law of Similarity, Law of Uniform Connectedness |
| Creating new interactive elements | Fitts's Law, Doherty Threshold, Aesthetic-Usability Effect |
| Changing visual hierarchy or emphasis | Von Restorff Effect, Law of Pragnanz, Selective Attention |
| Modifying forms or input flows | Postel's Law, Cognitive Load, Chunking, Parkinson's Law |
| Adding progress or status indicators | Goal-Gradient Effect, Zeigarnik Effect, Doherty Threshold |
| Redesigning navigation or menus | Jakob's Law, Serial Position Effect, Hick's Law, Mental Model |
| Simplifying or removing features | Tesler's Law, Occam's Razor, Pareto Principle |
| Onboarding, help, or empty states | Paradox of the Active User, Mental Model, Flow |
| Error states, feedback, or confirmation | Peak-End Rule, Postel's Law, Doherty Threshold |
| Content layout or information density | Chunking, Cognitive Load, Working Memory, Law of Pragnanz |

---

## The Laws

### Interaction & Responsiveness

**Fitts's Law** — The time to reach a target depends on its distance and size. Make interactive targets large enough to select accurately. Space targets apart to prevent mis-taps. Place frequent actions in easy-to-reach areas of the interface.

**Hick's Law** — Decision time increases with the number and complexity of choices. Minimize options when response time matters. Break complex tasks into smaller sequential steps. Highlight recommended choices to reduce cognitive burden. Don't oversimplify to the point of ambiguity.

**Doherty Threshold** — Keep system response under 400ms to maintain user engagement. Use animation to visually occupy users during background processing. Show progress indicators to make waits feel shorter. Perceived performance matters as much as actual speed — strategic micro-delays can even increase perceived value.

**Postel's Law** — Be liberal in what you accept, conservative in what you send. Accept varied user input and translate it to meet requirements. Anticipate diverse access methods and capabilities. Provide clear feedback on input boundaries. The more you plan for, the more resilient the design.

### Memory & Cognition

**Miller's Law** — Working memory holds roughly 7 (±2) items. Don't use this number to justify arbitrary design limits — instead, organize content into smaller chunks that are easier to process and remember. Capacity varies by person and context.

**Working Memory** — A cognitive system holding 4-7 chunks for 20-30 seconds. Support recognition over recall: show visited link states, provide breadcrumbs, carry critical information across screens. Transfer the memory burden to the system rather than the user.

**Cognitive Load** — The mental resources needed to use an interface. Intrinsic load (inherent task complexity) is unavoidable. Extraneous load (caused by poor design — distracting visuals, unnecessary elements, confusing layout) is entirely within your control. Eliminate it.

**Chunking** — Break information sets into meaningful groups. Helps users scan content, identify what aligns with their goals, and understand relationships. Apply clear visual hierarchy and separation between groups.

**Cognitive Bias** — Systematic errors in thinking that influence perception and decisions. Users rely on mental shortcuts (heuristics) that can mislead. Confirmation bias is especially relevant: users seek information confirming their existing beliefs. Be aware of these tendencies when designing persuasive or informational interfaces.

### Visual Grouping (Gestalt Principles)

These laws describe how the human eye organizes visual information into perceived groups. They are fundamental to layout, spacing, and visual hierarchy decisions.

**Law of Proximity** — Objects near each other are perceived as a group. Use spacing to create logical clusters. Elements close together seem functionally related. Whitespace between groups is as important as the groups themselves.

**Law of Similarity** — Similar-looking elements are perceived as related. Consistent color, shape, size, orientation, or motion signals group membership. Visually differentiate interactive elements from static content.

**Law of Common Region** — Elements within a shared boundary are perceived as a group. Borders, background colors, and cards create common regions. This is one of the easiest and most effective grouping techniques.

**Law of Uniform Connectedness** — Visually connected elements (lines, arrows, shared color) appear more related than unconnected ones. Use tangible connecting references between related items to establish visual relationships.

**Law of Pragnanz** — People interpret complex visuals in the simplest form possible because it requires the least cognitive effort. Design for simplicity. Simple shapes and figures are processed and remembered far better than complex ones.

### Familiarity & Expectations

**Jakob's Law** — Users spend most of their time on *other* sites and expect yours to work the same way. Leverage established conventions and mental models. When redesigning, consider letting users temporarily access the familiar version to reduce disruption.

**Mental Model** — Users carry compressed internal models of how systems work and apply them to new situations. Align your design with these existing expectations. The gap between designer assumptions and user mental models requires research (interviews, personas, journey mapping) to bridge.

**Aesthetic-Usability Effect** — Attractive design is perceived as more usable. Users tolerate minor usability issues in aesthetically pleasing interfaces. However, beauty can mask problems during usability testing — always validate both aesthetics and function.

### Attention & Recall

**Von Restorff Effect** — Among similar items, the visually distinctive one is best remembered. Make important actions and information stand out. Use restraint — if too many elements compete for emphasis, none stands out. Don't rely solely on color for distinction (accessibility concern for color vision deficiency).

**Serial Position Effect** — Users best remember the first and last items in a series. Place the most important actions at the far left and far right of navigation elements. Items in the middle are most easily forgotten.

**Selective Attention** — Users filter out stimuli irrelevant to their goals. Guide attention deliberately through visual hierarchy. Avoid styling real content like ads — users have learned to ignore banner-like elements (banner blindness). Be aware of change blindness: significant interface changes can go unnoticed when attention is focused elsewhere.

**Flow** — The state of full immersion in a task, achieved when challenge matches the user's skill level. Tasks too difficult cause frustration; too easy cause boredom. Reduce friction by eliminating unnecessary steps, keeping features discoverable, and providing clear system feedback on what was accomplished.

### Motivation & Progress

**Goal-Gradient Effect** — Motivation increases as users approach a goal. Show progress clearly and accurately. Even artificial progress (e.g., starting a progress bar at a non-zero point) measurably boosts completion rates. Users work faster as they get closer to finishing.

**Zeigarnik Effect** — People remember incomplete tasks better than completed ones. Provide clear signifiers of remaining content or steps. Use progress indicators to keep unfinished tasks salient and motivate completion.

**Peak-End Rule** — Experiences are judged by their most intense moment and their ending, not their average. Invest design effort in peak moments (where your product delivers maximum value) and final moments (checkout confirmation, save success). Negative peaks leave stronger impressions than positive ones.

### Simplicity & Efficiency

**Tesler's Law** (Conservation of Complexity) — Every system has irreducible complexity. The question is whether the user or the system bears it. Absorb as much complexity as possible into the design and development layer. Don't design for an idealized rational user — real people don't always behave rationally.

**Occam's Razor** — Prefer the simplest sufficient solution. The best way to reduce complexity is to avoid introducing it. Remove elements until nothing more can be removed without compromising function.

**Pareto Principle** — ~80% of effects come from ~20% of causes. Focus design effort on the areas that benefit the most users. Not all features, screens, or interactions contribute equally to the user's experience.

**Parkinson's Law** — Tasks expand to fill available time. Set time constraints aligned with user expectations. Autofill, smart defaults, and pre-populated fields help users complete tasks faster and resist task inflation.

### User Behavior

**Paradox of the Active User** — Users skip manuals and start using software immediately. They prioritize completing the immediate task over learning the system. Embed guidance contextually through tooltips, inline hints, and progressive disclosure rather than requiring upfront documentation reading.

**Choice Overload** — Too many options overwhelm users and impair decision-making. Provide search and filtering to narrow selections. Feature or recommend top options prominently. Offer side-by-side comparison for similar alternatives.

---

## How to apply

When reviewing UI changes against these laws:

1. Use the mapping table to identify which laws apply to your specific change
2. For each relevant law, assess whether the change aligns with or violates the principle
3. If you spot a violation, note it with a brief explanation referencing the law by name
4. Suggest a concrete improvement — don't just flag the problem. Every suggestion must name a specific UI pattern, component, value, or structural change. Never use hedge words ("consider", "perhaps", "might want to") or vague terms ("smart defaults", "better UX"). Say exactly what to build, add, remove, or change.
5. Prioritize fixes that affect the most users (Pareto Principle)

Keep feedback proportionate to the change. A small button move doesn't need a 10-law audit. Focus on the 2-3 most relevant laws for each change.
