# Components / Status

This file covers the components that show a value, a level or the progress of work: Activity rings, gauges, progress indicators and rating indicators.

## Pages
- [Activity rings](#activity-rings): Move, Exercise and Stand progress; strict appearance and color rules
- [Gauges](#gauges): a value within a range; macOS level indicators
- [Progress indicators](#progress-indicators): determinate and indeterminate progress, spinners, refresh controls
- [Rating indicators](#rating-indicators): macOS row of stars that shows a ranking

## Activity rings
Source: https://developer.apple.com/design/human-interface-guidelines/activity-rings

Activity rings show one person's daily progress toward the Move, Exercise and Stand goals. In watchOS the element always has three rings with the Activity app's colors and meanings; in iOS it has only the Move ring, or all three when an Apple Watch is paired.

**Do**
- Show the rings where they fit the app's purpose, mostly in health and fitness apps that feed HealthKit: on a workout metrics screen or on a workout summary.
- Make clear whose progress it is, with a label, a photo or an avatar.
- Keep the look identical everywhere: original ring colors, a black background, the black visible around the outermost ring.
- Enclose rings and background in a circle by setting the corner radius of the enclosing view, not by a circular mask.
- Add a thin black stroke around the outer ring if the background would not show there.
- Scale the rings so they fit their surroundings; adapt the surrounding UI to the rings, never the rings to the UI.
- Color ring labels (Move, Exercise, Stand) and current and goal values with the matching ring color (see the table).
- Keep an outer margin at least as large as the gap between the rings; nothing may crop or enter it.
- Separate any other ring-like element from Activity rings with padding, lines or labels, or by color and scale.
- Mention Activity progress in a notification only in a way unique to the app.

**Avoid**
- Rings for any data other than Move, Exercise and Stand, and Move, Exercise or Stand progress in any other ring-like element.
- Copying or modifying the rings for other purposes.
- Rings for more than one person.
- Filters, opacity changes, gradients, shadows or other effects on the rings.
- Notifications that repeat the system's Activity updates, and rings inside notifications.
- Rings as decoration, in labels or background graphics.
- Rings for branding: app icon or marketing.

**Platform notes**
- **iOS:** Use `HKActivityRingView`. With a paired Apple Watch it shows three rings; without one it shows the Move ring only, estimated from steps and workouts from other apps. History can mix both styles.
- **iPadOS, watchOS:** No additional considerations.
- **macOS, tvOS, visionOS:** Not supported.

**Specs**

| Ring | Color (RGB) |
| --- | --- |
| Move | R 250, G 17, B 79 |
| Exercise | R 166, G 255, B 0 |
| Stand | R 0, G 255, B 246 |

**APIs:** `HKActivityRingView`

Last change: March 29, 2024 — display guidance extended and the colors for related labels and values listed.

## Gauges
Source: https://developer.apple.com/design/human-interface-guidelines/gauges

A gauge shows a numeric value within a range and can add context about the range, such as low and high labels or a color spectrum. It maps the value onto a circular or linear path: the standard style marks the value with an indicator, the capacity style fills the path up to it. An accessory variant of both looks like watchOS complications and suits iOS Lock Screen widgets.

**Do**
- Write short labels for the current value and for both ends of the range. VoiceOver reads the visible labels.
- Consider a gradient fill that conveys the meaning, such as red to blue for hot to cold.

**Platform notes**
- **macOS:** A level indicator also shows a value in a range, in capacity, rating or (rarely) relevance style.
  - Capacity continuous: a translucent horizontal track filled by a solid bar. Prefer it for large ranges.
  - Capacity discrete: a row of equal rectangular segments, one per unit of capacity, each filled fully or not at all.
  - The default fill is green. Consider changing the color at significant levels (very low, very high, past the middle), for the whole indicator or as a tiered sequence of colors, for example red, then yellow, then green.
  - Rating style: see Rating indicators.
  - Relevance style: a shaded horizontal bar, for example to compare search results.
- **iOS, iPadOS, visionOS, watchOS:** No additional considerations.
- **tvOS:** Not supported.

**APIs:** `Gauge`, `NSLevelIndicator`

Last change: September 23, 2022 — page added.

## Progress indicators
Source: https://developer.apple.com/design/human-interface-guidelines/progress-indicators

A progress indicator shows that the app is working during loading or a long operation, and appears only while the operation runs. A determinate indicator fills a track for a task of known length: a progress bar fills from leading to trailing, a circular indicator fills clockwise. An indeterminate indicator (activity indicator, spinner) animates for a task of unknown length; all platforms have the spinner, and macOS also has an indeterminate bar.

**Do**
- Prefer a determinate indicator, so people can decide to wait, come back later or give up.
- Report advancement accurately and at an even pace.
- Keep the indicator moving; if the process stalls, explain the problem and what people can do.
- Switch an indeterminate bar to determinate as soon as the duration is known.
- Add a short, accurate description only when it gives useful context.
- Show progress in the same location every time.
- Offer Cancel when interrupting has no negative side effects; add Pause too when cancel would lose progress, such as a partial download.
- When canceling loses progress, show an alert to confirm the cancellation or resume.

**Avoid**
- Uneven progress, such as 90 percent in 5 seconds and the last 10 percent in 5 minutes.
- Switching from a spinner to a bar.
- Vague descriptions such as "loading" or "authenticating".

**Platform notes**
- **iOS, iPadOS:** A refresh control is a hidden spinner that appears when people drag a view (usually a table) down to reload, as in the Mail inbox. Still refresh content automatically and regularly. Add a title only with useful content information, such as the last update time in Podcasts, never instructions for refreshing.
- **macOS:** The indeterminate indicator can be a bar or a spinner. Prefer a spinner for background tasks and small areas, such as inside a text field or next to a button. Do not label a spinner.
- **watchOS:** Indicators are white over the background color by default; set a tint color to change them.
- **tvOS, visionOS:** No additional considerations.

**APIs:** `ProgressView`, `UIProgressView`, `UIActivityIndicatorView`, `UIRefreshControl`, `NSProgressIndicator`

Last change: September 12, 2023 — guidance common to all platforms merged.

## Rating indicators
Source: https://developer.apple.com/design/human-interface-guidelines/rating-indicators

A rating indicator shows a ranking as a horizontal row of symbols, stars by default. It rounds to whole symbols, never partial ones, and keeps fixed spacing that does not stretch or shrink with the component's width.

**Do**
- Let people change an item's rank inline in the list, without a separate edit screen.
- Make a custom symbol's meaning clear if it replaces the star; people recognize the star as a rating.

**Platform notes**
- **macOS:** No additional considerations.
- **iOS, iPadOS, tvOS, visionOS, watchOS:** Not supported.

**APIs:** `NSLevelIndicator.Style.rating`

Last change: September 23, 2022 — page added.
