# Components / Content

This file covers the components that present content: charts, images, multiline text and embedded web pages.

## Pages
- [Charts](#charts): marks, axes, descriptions, color and accessibility for data charts
- [Image views](#image-views): showing a still or animated image, not an icon
- [Text views](#text-views): long, styled or editable multiline text
- [Web views](#web-views): embedded HTML or websites inside an app

## Charts
Source: https://developer.apple.com/design/human-interface-guidelines/charts

A chart plots a dataset so people see a few key facts at a glance. Its parts: marks in a plot area, axes with ticks, grid lines, labels, titles, annotations and an optional legend for color or shape meaning.

**Do**
- Pick the mark type for the message: bar to compare categories or parts of a whole (or per-period sums), line for change and trend over time, point for relationships, outliers and clusters.
- Combine marks when it helps, for example points on a line to show single values and the trend together.
- Use a fixed axis range when the bounds mean something (battery 0% to 100%); use a dynamic range when values vary widely and marks should fill the plot.
- Start bar-chart Y axes at zero; let other charts (heart rate) start elsewhere when zero hides real differences.
- Use familiar tick sequences (0, 5, 10), not unusual ones (1, 6, 11).
- Tune grid-line and label density to the task; with interactive inspection, use fewer lines and lighter labels.
- Give a title and labels that say what the chart shows before people read it; summarize the main message in plain text (Weather's next-hour rain title and subtitle).
- Keep the data most prominent; axes and descriptions support it.
- In compact widths, maximize plot width: keep vertical-axis labels short, move units to the title, put long category names inside the plot if nothing is hidden.
- Make every chart accessible to VoiceOver; add Audio Graphs for tones and summaries.
- Allow interaction (scrubbing an indicator, as in Stocks) for details, but show critical information without interaction.
- Widen small hit targets to the whole plot area so people can scrub across values.
- Give keyboard, Full Keyboard Access and Switch Control a logical path (for example along the X axis) or let focus move by subsets of a large dataset.
- Signal changes to marks or axes with animation plus another cue, so VoiceOver users and people without animation notice them.
- Align the chart's leading edge with nearby views; put vertical grid-line labels on the trailing side, or move the Y axis to the trailing side.
- Use a tick to anchor a label that looks detached.
- Separate adjacent color areas, such as segments of a stacked bar, with a small gap.
- Give each important or interactive element its own accessibility label, or label groups of marks when that serves the purpose better (Maps elevation by route section, Health steps per bar).
- One summary label is enough for a small chart inside a button that opens the full chart.
- Without Audio Graphs, describe chart type, what each axis means and the axis bounds.
- In accessibility labels: give context (date, place) with the value, use actual values, spell out dates and units ("June 6", "60 minutes"), describe meaning not appearance, and name axes in a consistent order.
- Hide visible axis and tick labels from assistive technologies.

**Avoid**
- Using color alone to separate series or convey key facts; add shapes or patterns (Health blood pressure uses circle and diamond).
- Subjective words in labels such as rapidly, gradually, almost.
- Ambiguous formats and abbreviations such as "6/6" or "60m".

**Platform notes**
- **watchOS:** Avoid complex chart interactions; show glanceable information and leave detail and exploration to the iPhone app.
- **iOS, iPadOS, macOS, tvOS, visionOS:** No additional considerations.

**APIs:** Swift Charts, Audio Graphs, `accessibilityRespondsToUserInteraction(_:)`, `UIAccessibility.Notification`, `NSAccessibility.Notification`

Last change: September 23, 2022 — page added.

## Image views
Source: https://developer.apple.com/design/human-interface-guidelines/image-views

An image view shows one image, or an animated image sequence, on a transparent or opaque background. It can stretch, scale, fit or pin the image and is normally not interactive.

**Do**
- Use an image view only when its job is to show an image.
- For an interactive image, use a system button that shows the image.
- Use SF Symbols or an interface icon (template image) for icons; both take the accent color.
- Make overlaid text contrast with the image; add a text shadow or a background layer.
- Give all images in an animated sequence the same size, and prescale them to the view.

**Avoid**
- Adding button behavior to an image view.

**Platform notes**
- **iOS, iPadOS:** No additional considerations.
- **macOS:** Use an image well for an editable image (copy, paste, drag, Delete to clear). Use an image button for a clickable image.
- **tvOS:** Images often stack transparent layers for depth; see layered images.
- **visionOS:** Windows can show 2D, stereoscopic and spatial photos. With RealityKit, images can also sit beside 3D content outside image views, or become a spatial scene.
- **watchOS:** Prefer SwiftUI animations; WatchKit can animate an image sequence when needed.

**Specs**
- Formats: PNG, JPEG, PDF.

**APIs:** `Image` (SwiftUI), `UIImageView`, `NSImageView`, `ImagePresentationComponent`, `WKImageAnimatable`

Last change: June 21, 2023 — visionOS guidance added.

## Text views
Source: https://developer.apple.com/design/human-interface-guidelines/text-views

A text view shows multiline styled text that can be editable. It scrolls when content overflows, aligns to the leading edge and uses the system label color by default.

**Do**
- Use a text view for long, editable or specially formatted text.
- Use a label for a small amount of text, or a text field for short editable text.
- Keep text legible across fonts, colors and alignments; adopt Dynamic Type.
- Test with accessibility settings on, such as Bold Text.
- Make useful text selectable and copyable: error messages, serial numbers, IP addresses.

**Platform notes**
- **iOS, iPadOS:** Show the keyboard type that matches the content. An editable text view brings up the keyboard on selection (also in visionOS).
- **tvOS:** Text views display text; use text fields for editable text.
- **macOS, visionOS, watchOS:** No additional considerations.

**APIs:** `Text` (SwiftUI), `UITextView`, `NSTextView`

Last change: June 5, 2023 — updated for watchOS 10.

## Web views
Source: https://developer.apple.com/design/human-interface-guidelines/web-views

A web view loads rich web content, such as embedded HTML or a website, inside an app (Mail uses one for HTML messages).

**Do**
- Turn on forward and back navigation, with controls, when people may visit several pages; it is off by default.
- Use a web view for brief visits to a site without leaving the app.

**Avoid**
- Building a web browser on a web view; Safari is the browser.

**Platform notes**
- **iOS, iPadOS, macOS, visionOS:** No additional considerations.
- **tvOS, watchOS:** Not supported.

**APIs:** `WKWebView`
