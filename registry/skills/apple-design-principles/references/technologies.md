# Technologies

Rules for the technologies that are not tied to an Apple service: augmented reality, generative AI, machine learning and screen-reader support. The pages about Apple's own services and assets are not part of this skill.

## Pages
- [Augmented reality](#augmented-reality): ARKit experiences, coaching, placement, AR badges
- [Generative AI](#generative-ai): designing responsible AI features, inputs and outputs
- [Machine learning](#machine-learning): explicit and implicit feedback, mistakes, confidence, attribution
- [VoiceOver](#voiceover): labels, hints, rotor and VoiceOver support

## Augmented reality
Source: https://developer.apple.com/design/human-interface-guidelines/augmented-reality

AR uses the camera feed to place 3D virtual objects in the real world, which people explore by moving the device, gestures, or together in multiuser sessions. These rules cover ARKit in iOS and iPadOS.

**Do**
- Offer AR only on capable devices. An AR-first app ships only to ARKit devices; an optional AR feature is simply not shown on unsupported devices.
- Give the camera view the whole display.
- Make realistic objects convincing: lifelike textures, correct scale, placement on detected surfaces, environment lighting, camera grain, top-down diffuse shadows, and updates at 60 fps.
- Prefer small or coarse reflective surfaces, because reflections are approximations.
- Confirm contact with sounds or haptics.
- Put needed info and controls in screen space; make persistent controls indirect 2D controls, reachable without changing grip, optionally translucent.
- State space and surface requirements up front; consider feature sets for different environments.
- Limit fatigue: place objects so people need not move closer; keep game levels short with breaks.
- Introduce movement gradually and avoid large or sudden movements, for safety.
- Use the system coaching view (`ARCoachingOverlayView`) for initialization and relocalization, and hide unrelated UI meanwhile. Base a custom coaching flow on it.
- Show a placement indicator aligned with the detected plane, place the object immediately, then refine its position subtly (nudge it back onto the surface).
- Guide people to offscreen objects with visual or audio cues, such as an edge indicator.
- Use plane classification, for example furniture only on "floor", a game board only on "table".
- Prefer direct manipulation; use indirect controls when people move around a lot.
- Use familiar gestures: one-finger drag to move, two-finger rotation to spin. Accept gestures near small or distant objects as meant for them.
- Allow scaling only where the app does not represent the real world (not for furniture previews).
- Keep moving objects attached to surfaces and visible; no jumping or vanishing.
- Consider motion and proximity as inputs, for example a character that turns toward an approaching person.
- Multiuser: support people occlusion, and let late participants join through implicit map merging.
- Image detection: wait up to one second before fading content when a detected image disappears.
- Use friendly words, not technical terms such as ARKit, world detection or tracking ("Unable to find a surface. Try moving to the side or repositioning your phone." instead of "Unable to find a plane. Adjust tracking.").
- In 3D, prefer 3D hints such as a rotation indicator over 2D text overlays.
- Show critical text in screen space; text in 3D space faces people and keeps one type size at any distance.
- Show an indicator when tapping gives more information.
- Interruptions: use coaching for relocalization, hide placed objects until they are restored, embed non-AR tasks in the AR view, and offer a reset when relocalization fails.
- Show a visual indicator when the front camera loses the face for more than about half a second.
- Always let people reset the experience; suggest fixes: more light and moving around (insufficient features), moving slower (excessive motion), a textured surface (slow detection).

**Avoid**
- Cluttering the scene with controls and text.
- Precise alignment to surface edges; boundaries are approximations.
- Scaling an object to make it seem closer.
- Conflicting similar gestures, such as pinch and two-finger rotation, without testing.
- Showing text overlays in 3D unless people ignore contextual hints.

**Icons and badges**
- Use the AR glyph only in controls that start an ARKit experience; change only size and colour.
- Use AR badges (collapsed and expanded) only to mark items viewable in ARKit; never alter or recolour them.
- Prefer the full AR badge; use the glyph-only badge in tight spaces.
- Badge only when the app mixes AR and non-AR items; always in the same corner of the photo, visible without hiding detail.

**Platform notes**
- **iOS, iPadOS:** Supported, no extra rules.
- **visionOS:** With permission, ARKit detects surfaces, reads hand and finger positions for custom gestures, and brings nearby physical objects into immersive experiences.
- **macOS, tvOS, watchOS:** Not supported.

**Specs**
- Frame updates: 60 times per second.
- Reference images: best at 100 or fewer active at one time; swap sets by context, such as location. Limit images that need accurate position tracking.
- Clear space around the AR glyph and AR badge: 10% of its height.

**APIs:** ARKit, `ARCoachingOverlayView`, `ARTrackedRaycast`, `isCollaborationEnabled`, people occlusion, image detection.

## Generative AI
Source: https://developer.apple.com/design/human-interface-guidelines/generative-ai

Generative AI uses machine learning models to create or transform text, images and other content. Use it where it gives clear value: saved time, better communication or more creativity.

**Do**
- Design responsibly: outputs vary even for the same input, and requests are hard to predict; plan for inclusion, care and privacy.
- Keep people in charge: honour in-scope requests, handle sensitive content carefully, and let people dismiss, revert or retry results.
- Label where and when the app uses AI; follow local disclosure laws.
- Ask for the personal details a feature needs instead of inferring personal or cultural traits; test with diverse people to find stereotypes.
- Offer a non-AI fallback where possible, and keep the app good without the feature.
- State capabilities and limits up front: a short tutorial, curated starter suggestions for open prompts, and tips for good results.
- Pick the model type for privacy: on-device is private, fast and offline; server models give more power and context. For server use, process locally first, minimize data, and show what is sent, stored or used for training.
- Ask permission before using personal or usage data; use the minimum; always offer opt-out; get explicit consent for storing or training. Apps for kids have stricter rules.
- Explain briefly how the model uses and stores data, and whether it trains on it.
- Evaluate models early; some are unavailable because of device, network or battery. Foundation Models needs a compatible device with Apple Intelligence on.
- Choose diverse, licensed datasets of known origin, and test for bias and misinformation.
- Offer varied example inputs.
- Tell people that output can contain errors; scope requests narrowly to reduce hallucinations.
- Ask for confirmation before significant actions on someone's behalf; follow model usage policies and local AI regulation.
- Put Edit, Undo, Retry or Adjust near generated content, and confirm when a correction takes effect.
- When a request is blocked, coach people (for example "Unable to use that description") and suggest better requests.
- Test misuse: out-of-scope, vague, sensitive, controversial and harmful prompts; turn findings into policies.
- Reduce copyright risk: build on protected models, curate inputs, offer pre-approved prompts.
- Plan for latency: a loading state or background generation.
- Show specific progress text ("Summarizing key themes from your notes" instead of "Processing…"); on failure, say what happened and the next step.
- Consider several distinct results to choose from.
- Plan model updates (blocked words, fine-tuning, retesting, prompt engineering) and retest every update.
- Offer voluntary, unobtrusive feedback, such as thumbs up and down, plus a detailed option.
- Separate the model from the UX so you can swap models later.

**Avoid**
- Making people believe AI content or conversation comes from a human.
- Asking for factual output without verified, current data, and AI content where a hallucination could harm someone.
- Automating destructive or hard-to-undo actions, such as deleting photos or purchasing.

**Platform notes**
- **All platforms:** No extra rules.

**APIs:** Foundation Models, Vision, ARKit body tracking.

Last change: June 8, 2026 — added guidance on refining results and on progress feedback during generation; updated model-type guidance.

## Machine learning
Source: https://developer.apple.com/design/human-interface-guidelines/machine-learning

Machine learning lets apps learn from data and usage for features such as recognition, recommendations and personalized suggestions. Design the model and the UX together, and expect model changes to take time.

**Do**
- Define the feature's role on five axes: *critical or complementary* (central features need high accuracy), *private or public* (sensitive data needs high accuracy; privacy always), *proactive or reactive* (unrequested results need higher quality), *visible or invisible* (invisible features show reliability poorly), *dynamic or static* (dynamic features often use calibration and feedback).
- Explicit feedback: ask only when needed, keep it voluntary, describe each option by its effect ("Suggest less pop music", "Mute politics for a week"), add icons only with text, offer several progressively specific options, act on it at once and persist it, and use it for when and where to show results.
- Implicit feedback: secure it, tell people how data is gathered and shared and let them restrict it, combine several signals, withhold private or sensitive suggestions on shared devices, favour recent feedback, update at a cadence that fits the feature (typing at once, songs not continuously), and expect UI changes to shift the signals.
- Favourites and social reactions count as implicit feedback.
- Calibration: use it only when the feature cannot work without it; secure the data; explain the benefit (what, not how); ask for the essential minimum; do it once, early (except per-object calibration such as each baseball field); make it quick; show a goal and progress; help at once if progress stalls without blaming people; confirm success; allow cancel at any time without comment; let people edit or remove the data later.
- Mistakes: match corrective tools to the severity; make frequent mistakes easy to fix; keep the feature current; keep fixes light in the UI; take special care with proactive features; check how a fix in one area affects others.
- Corrections: show the steps of automation so the same controls fix it (Photos auto-crop); show corrected content at once and persist it; allow correcting corrections; prefer guided corrections (alternatives list) over freeform; learn from corrections only if quality improves.
- Multiple options (suggested, requested, corrections): prefer diverse options (toll-free, scenic, highway routes), keep the count small on one screen, put the most likely first and maybe preselect it, describe differences, group large sets, learn from selections.
- Confidence: verify that values track quality before using them; translate them into familiar concepts ("Because you listen to pop music", not "97% match"); otherwise rank results, or use categories such as "high chance" and "low chance"; show numbers only where people expect statistics (weather, sports, polls); prefer actionable advice ("This is a good time to buy"); adapt presentation by threshold (ask for confirmation at low confidence); set a threshold below which proactive results are hidden.
- Attribution: state the basis of a result to help choose among options ("New books by authors you've read"); balance specific and general; keep it factual ("Because you've read nonfiction", not "Because you love nonfiction").
- Limitations: set expectations for rare serious limits beforehand; show how to get good results (placeholder text, live guidance such as Memoji's lighting tips, alternatives instead of no results); explain poor results ("doesn't work well in the dark"); consider announcing when a limit is removed.

**Avoid**
- Vague feedback words such as *dislike*; icons alone.
- Letting implicit feedback narrow exploration, or relying only on it (confirmation bias).
- Repeat calibration for a person.
- Relying on corrections to make up for poor results; features where correcting costs more than doing the task.
- Too many options, or options that look alike.
- Showing confidence you have not validated; low-confidence proactive results.
- Technical or statistical jargon in attributions, except for statistical domains.

**Platform notes**
- **All platforms:** No extra rules.

**APIs:** Create ML, Core ML.

Last change: June 8, 2026 — small clarity edits.

## VoiceOver
Source: https://developer.apple.com/design/human-interface-guidelines/voiceover

VoiceOver is the screen reader that lets blind and low-vision people use an app without seeing the screen. It works in apps and games on Apple platforms, also in Unity with Apple's Unity plug-ins.

**Do**
- Give every key element a descriptive accessibility label, also custom elements, and update labels when content changes.
- Describe meaningful images, only what the image itself conveys beyond nearby captions.
- Give charts and infographics a short summary and make their interactions available to VoiceOver.
- Give each screen a unique, short title and accurate section headings.
- Express visual-only relationships: group, order and link elements, for example each image with its caption (`shouldGroupAccessibilityChildren`). Reading follows the locale's order, top-to-bottom and left-to-right in US English.
- Announce visible content and layout changes (`AccessibilityNotification`).
- Expose headings, links and other content types to the rotor, which also opens the braille keyboard.

**Avoid**
- Generic default labels on controls with a specific function.
- Describing purely decorative images; hide them (`accessibilityHidden(_:)`, `isAccessibilityElement`).

**Platform notes**
- **iOS, iPadOS, macOS, tvOS, watchOS:** No extra rules.
- **visionOS:** With VoiceOver on, apps with custom gestures get no hand input by default; people can turn on Direct Gesture mode, which disables VoiceOver gestures and passes hand input to the app.

**APIs:** Accessibility modifiers, `accessibilityHidden(_:)`, `accessibilityElement`, `isAccessibilityElement`, `shouldGroupAccessibilityChildren`, `AccessibilityNotification`, `AccessibilityRotorEntry`, `UIAccessibilityCustomRotor`, `NSAccessibilityCustomRotor`.

Last change: March 7, 2025 — new page.

