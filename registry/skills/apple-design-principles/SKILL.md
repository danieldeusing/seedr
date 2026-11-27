---
name: apple-design-principles
description: |
  Design and review user interfaces by Apple's Human Interface Guidelines (HIG): the eight design
  principles, the platform rules for iOS, iPadOS, macOS, tvOS, visionOS and watchOS, and the
  guidance for every foundation, pattern, component, input and technology. Use when building or
  reviewing a SwiftUI, UIKit or AppKit screen, a widget, a notification, a sheet, a
  toolbar or a tab bar; when asked "is this HIG-conformant", "does this feel native", "what is the
  minimum tap target", "which component do I use"; and before an App Store submission. Also use
  to check whether Apple changed the HIG since this skill was last updated. The skill takes
  Apple's principles and rules, never Apple's assets: icons, fonts and components come from the
  project's own design system (Clarity, Material, shadcn/ui) or from a free set.
---

# Apple Design Principles

A working copy of Apple's Human Interface Guidelines for an agent that designs or reviews UI for
Apple platforms. The reference files hold the rules of 131 HIG pages, rewritten in our own
words, with the exact values (sizes, ratios, counts) and a link to each source page.

Apple owns the HIG. These files are a summary, not Apple's text. When the exact wording, an
image or a value you cannot find matters, fetch the live page (see "The live page").

## The eight principles

Apply these to every decision. When two rules conflict, the principles decide.

| Principle | In short | Ask of the design |
|---|---|---|
| **Purpose** | Make something that matters. | What is this product for, and does this screen serve that? Which few features must be great? |
| **Agency** | People work their own way. | Can a person get to the task directly, leave a guided flow, and undo a mistake without loss? |
| **Responsibility** | Act in the person's interest. | Is it clear what the product does with data, and why it asks for each permission? Does it collect only what it needs? |
| **Familiarity** | Build on what people know. | Does it use known concepts and system patterns, behave the same everywhere, and give feedback for each action? |
| **Flexibility** | Fit many contexts and needs. | Does it work with every input (touch, keyboard, pointer, voice), every size and setting, for every person, and feel at home on each platform? |
| **Simplicity** | Clear and direct. | Does each element earn its place? Are the words the shortest that are exact? Is the hierarchy obvious? |
| **Craft** | Care about each detail. | Are visuals, motion, wording and sound deliberate? Was it tested in real conditions and kept current with the platform? |
| **Delight** | Make it human. | Which feeling fits this product, and where does a moment of character help without getting in the way of the task? |

The full rules of each principle are in `references/getting-started.md`.

## Principles from Apple, assets from the project

This skill takes Apple's principles and rules. It does not take Apple's assets. Do not download,
copy or ship Apple's icons (SF Symbols), fonts (San Francisco, New York), UI kits, device bezels,
badges or the images of the HIG pages: Apple licenses them for its own platforms only.

| The product | Components and specs | Icons and fonts |
|---|---|---|
| Project with its own design system (Clarity, Material, a company kit) | That system's components, tokens and patterns. Apply the principles and `references/patterns.md`; do not bring Apple's component specs or look into it. | That system's icons and fonts |
| Web or cross-platform product without a design system | The project's component library; for shadcn/ui, use its own skill | A free icon set such as Lucide (ISC licence); the CSS system font stack (`system-ui`) or a free font such as Inter |
| Native app on an Apple platform | The SDK's system components and the HIG rules in full | Only what the SDK gives at run time (system font, system images through the API); add no downloaded Apple asset |

Where a reference section names an Apple asset (an SF Symbol, a San Francisco font), take the
rule behind it (one consistent icon family, text styles that scale) and apply it with the
project's assets.

The 27 HIG pages about Apple's own assets and services are left out on purpose: SF Symbols, app
icons, and the technologies tied to an Apple service (Apple Pay, Sign in with Apple, Wallet,
Siri, HealthKit, CarPlay and the like). `references/manifest.json` lists them under `excluded`.
When a native app needs one of them, read the live page with `scripts/hig.mjs fetch <slug>`.

## How to use this skill

1. Answer the question of each of the eight principles for the screen or change, in every
   project. Fix what fails, for example a destructive action without confirmation or undo.
2. Name the platform or platforms. Read their page in `references/getting-started.md`
   ("Designing for iOS" and so on). The platforms differ; do not carry an iOS rule to macOS.
3. Find the pages for the task in the table below. Each reference file starts with a list of its
   pages; read only the sections you need.
4. Design or review against the **Do**, **Avoid**, **Platform notes** and **Specs** of those
   sections. In a review, end each finding with the full URL of its page's `Source:` line.
5. Prefer a system component and its standard behaviour over a custom one. A custom component
   must keep the hit target, the states, Dynamic Type, Dark Mode and the accessibility of the
   system one.

## Where to look

| Task | File |
|---|---|
| The eight principles in full; what is special on iOS, iPadOS, macOS, tvOS, visionOS, watchOS, in games, on iPhone Duo | `references/getting-started.md` |
| Accessibility, branding, colour, Dark Mode, icons, images, inclusion, layout, materials, motion, privacy, right-to-left, spatial layout, typography, writing | `references/foundations.md` |
| A flow: onboarding, launching, loading, searching, settings, modality, feedback, entering data, drag and drop, accounts, notifications, undo, sharing, printing, audio, video, haptics | `references/patterns.md` |
| Charts, image views, text views, web views | `references/components-content.md` |
| Lists and tables, collections, split views, tab views, column and outline views, boxes, labels, lockups, disclosure controls | `references/components-layout-and-organization.md` |
| Buttons, menus, the menu bar, context menus, Dock menus, toolbars, pop-up and pull-down buttons, activity views, edit menus, Home Screen quick actions, ornaments | `references/components-menus-and-actions.md` |
| Tab bars, sidebars, search fields, path controls, token fields | `references/components-navigation-and-search.md` |
| Alerts, sheets, popovers, action sheets, windows, panels, page controls, scroll views | `references/components-presentation.md` |
| Pickers, toggles, sliders, steppers, text fields, segmented controls, combo boxes, colour and image wells, digit entry views, virtual keyboards | `references/components-selection-and-input.md` |
| Progress indicators, gauges, activity rings, rating indicators | `references/components-status.md` |
| Widgets, Live Activities, notifications, complications, watch faces, controls, App Shortcuts, snippets, status bars, Top Shelf | `references/components-system-experiences.md` |
| Gestures, keyboards, pointing devices, Apple Pencil, Digital Crown, eyes, focus, game controls, remotes | `references/inputs.md` |
| Augmented reality, generative AI, machine learning, VoiceOver | `references/technologies.md` |

When you do not know which file holds a page, search the page list:

```bash
grep -i "<word>" references/manifest.json
```

The `section` of the match names the file.

## Values that decide most reviews

Check these first; the reference sections hold the detail and the exceptions.

- **Hit target:** at least 44x44 pt; 60x60 pt in visionOS (`references/components-menus-and-actions.md`, Buttons).
- **Text size and Dynamic Type:** the default and minimum sizes per platform, and the text styles, are in `references/foundations.md` (Typography).
- **Contrast and colour:** the contrast ratios and the rule not to carry meaning by colour alone are in `references/foundations.md` (Accessibility, Color).
- **Safe areas, margins and device sizes:** `references/foundations.md` (Layout).
- **Permission requests and data use:** `references/foundations.md` (Privacy).

## The live page

`scripts/hig.mjs` reads the JSON that developer.apple.com serves. It needs Node 18 or newer and
the network, and it has no dependencies.

```bash
node scripts/hig.mjs list             # every page: section, slug, title
node scripts/hig.mjs fetch buttons    # the full live page as Markdown, with image and video URLs
node scripts/hig.mjs dump <dir>       # every page as a file, for a private local mirror
```

The slug is the last part of a page's `Source:` link. Use `fetch` when a reference section does
not answer the question, when a person asks for Apple's exact wording, or when you need a
picture: the output lists each image with its description and URL. Look at an image to
understand a rule; do not copy it into a product. Quote Apple only in short extracts, and name
the source page.

Do not commit the output of `fetch` or `dump` to a public repository; it is Apple's text.

## Keep the skill current

Apple changes the HIG several times a year, most of all after WWDC in June. Each page carries a
change log, and <https://developer.apple.com/design/whats-new/> lists the changes by date.
`references/manifest.json` records the state this skill was written against: for each page a
hash of its text and the date and note of its last change.

Check for changes:

```bash
node scripts/hig.mjs check
```

It exits 0 when nothing changed. It ignores the pages under `excluded`. Otherwise it exits 1 and prints one line per difference:

| Line | Meaning | What to do |
|---|---|---|
| `CHANGED <slug> (<section>) — <date>: <note>` | Apple changed the page's text. | `fetch` the page, rewrite its section in the section's reference file, update its "Last change" line. |
| `NEW <slug> (<section>)` | A page was added. | `fetch` it, add a section in Apple's page order and a line in the file's page list. Add it to "Where to look" when it opens a new topic. |
| `REMOVED <slug> (<section>)` | A page is gone. | Delete its section and its line in the page list. |
| `MOVED <slug>: <old> -> <new>` | A page changed section. | Move its section to the other reference file. |

To update:

1. Run `check` and read <https://developer.apple.com/design/whats-new/> for the same dates; the
   page explains the intent behind a change.
2. For each line, do what the table says. Write in your own words; keep the values exact; copy
   no sentence from Apple.
3. If "Design principles" changed, update the table "The eight principles" in this file too.
4. Run `node scripts/hig.mjs check --write` to record the new state in the manifest.
5. Run `check` again. It must print "No change".

When a person asks whether a rule is still current, run `check` first and say what it reported.
