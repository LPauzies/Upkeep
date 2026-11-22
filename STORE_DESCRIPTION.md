# Upkeep — Store Listing Description (Chrome Web Store & Firefox Add-ons)

Keep this file updated as new features ship so you can copy-paste directly into the **Chrome Web Store** and **Mozilla Add-ons (AMO)** dashboards.

---

## Short Summary (max 132 chars for CWS / 250 chars for AMO)

```text
MTG UI overhaul for endstep.cc: dual live graveyards, midline phase bar, locked Game Log, custom colors & colorblind modes.
```

---

## Full Store Description (Copy-Paste Ready — Plain Text)

```text
Upkeep is a clean, tournament-inspired UI extension for Magic: The Gathering matches on endstep.cc (both /game/* and /spectate/*). Designed for clarity and zero visual clutter, Upkeep keeps every critical piece of game state visible at a glance without ever shrinking or altering your cards.

KEY FEATURES

Dual Live Graveyards (Right Rail)
- View both your opponent's graveyard and your own graveyard side-by-side in a collapsible 2-column card grid.
- Updates in real time throughout the match with automatic card grouping (xN badges) and quick type filters (All, Creatures, Spells, Lands).
- Instant high-legibility card zoom on hover so you can read graveyard cards without opening modal dialogs.

Midline Horizontal Phase Timeline
- Moves Endstep's native phase & step bar horizontally between the two battlefields for faster turn tracking.
- Preserves full native interactivity: left-click to set stops, right-click for yields, and hover tooltips.

Locked Left Rail — Game Log, Decision & Compact Auto-Pass
- Automatically opens and docks the Game Log in a fixed-width, jump-free left rail.
- Eliminates vertical layout shifts between WAITING, PASS PRIORITY, targeting prompts, and complex modal spells (such as choose-two / X-mode dialogs).
- Compacts the Auto-Pass controls into a clean single-row bar (EOT [E], MY TURN [B], ACTION [R]) with auto-dismissing hover tooltips to reclaim vertical space.

Battlefield Clarity & Focus
- Anchors "The Stack" neatly to the top-left of the battlefield.
- High-legibility player plates for life totals, library, hand, and exile counts.
- Optional toggle to hide redundant right-side action toast notifications.
- Full support for both live matches (/game/*) and spectator mode (/spectate/*).

Custom Colors & Colorblind Accessibility
- 4 built-in accessibility presets: Standard, Deuteranopia / Protanopia (Okabe-Ito), Tritanopia, and High Contrast.
- Customize 9 individual colors with live instant sync across active Endstep tabs:
  • Active & inactive battlefield tints (your turn vs. opponent's turn)
  • Active phase step, your stops, and opponent stops
  • Normal life total color & targeting progress bar

Full Control & Keyboard Shortcuts
- One-click ON/OFF master switch in the toolbar popup to toggle between Upkeep and the original Endstep UI at any time.
- Every layout and readability module can be toggled independently and persists automatically.
- Built-in keyboard shortcuts:
  • U — Toggle Upkeep On/Off
  • G — Toggle Dual Graveyards panel
  • L — Toggle Game Log panel
- Advanced DOM Selector Options page so you can adapt selectors immediately if endstep.cc updates its markup.

PRIVACY & PERMISSIONS
- Zero data collection, zero analytics, and zero external requests.
- Only requests local storage (to save your preferences) and access to https://endstep.cc/*.
- Open-source on GitHub: https://github.com/LPauzies/Upkeep
```

---

## Latest Release Notes (Copy-Paste for AMO / Store Updates)

```text
- Added full theme color customization (9 editable hex colors) and 4 colorblind presets (Standard, Deuteranopia/Protanopia, Tritanopia, High Contrast) in both popup and options.
- Added full support for spectator mode (/spectate/*).
- Fixed Game Log left-rail anchoring and prevented layout shifts during complex modal spell decisions.
- Fixed Auto-Pass tooltips lingering on screen with reliable auto-dismiss behavior.
- Improved targeting progress bar readability.
```
