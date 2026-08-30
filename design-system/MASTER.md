# Agmentic Homepage Design System

## Concept

**Imagination made active.** A kinetic editorial experience about possibility, ideas and new human relationships with AI. The opening poster creates the signal; the assemblies ledger documents where that signal gathers people.

## Principles

- The opening remains one poster, one headline, one invitation and one CTA. Deeper content begins only after the complete poster field.
- Curiosity precedes explanation.
- The acid beam represents possibility and activation; it intersects type, logo and invitation as one spatial system.
- Language remains precise, human and durable. Avoid fictional sci-fi vocabulary and meaningless metadata.
- Core homepage language: “Imagine what becomes possible.”, “Next Agmentic event”, and “Get invited to what’s next.”
- Asymmetry and overlap create tension; the invitation remains immediately usable.
- Avoid startup conventions, cards, glass, purple gradients, AI imagery, dashboards, and ornamental 3D.

## Typography

- Display/UI: Instrument Sans 400–700 with its variable width axis; neutral grotesk structure supports bold editorial composition without becoming a novelty face.
- Metadata: IBM Plex Mono 400–500, uppercase, `0.09em` tracking. It is never used for substantial copy.
- Headline: controlled line-height (`0.72–0.74`), negative tracking and a compact three-line step that stays within the left visual field, preserving the beam and center as negative space.
- “IMAGINE” is slightly heavier than the remaining headline and remains solid off-white, with a very fine network of organic, branching brand-green veins clipped strictly inside its letterforms. It is a line pattern rather than a color wash; the remaining headline stays solid paper.
- Functional input text remains at least 16px on mobile.

## Color and depth

- Ink `#090a08`, paper `#f3f1e9`, signal `#b8eb52`, active signal `#5aaa10`, error `#ff9a90`.
- Depth comes from controlled light falloff, three beam layers, concentric signal geometry, and restrained grain—not cards or shadows.
- Brand green follows the official logo gradient: leaf `#b8eb52` and deep leaf `#5aaa10`. It is reserved for signal, focus, CTA, and success.

## Composition

- Desktop: headline crosses the viewport diagonally; the invitation floats on the beam’s destination without a panel.
- Compact laptop/tablet landscape: the two-field desktop tension is preserved at a tighter scale; headline and invitation remain spatially independent.
- Tablet portrait: the headline occupies an editorial upper field while the invitation is deliberately offset into a lower-right field.
- Mobile portrait: the page becomes a self-contained vertical poster with fixed visual zones for masthead, headline, signal lock, invitation, form, and utilities. Short phones gain controlled vertical scroll rather than compressed or overlapping content.
- Responsive compositions: mobile poster at ≤640px, tablet portrait at 641–820px, compact two-field poster at 821–1179px, and full desktop at ≥1180px. QA targets: 320/375/430px mobile, 768px tablet portrait, 1024px tablet landscape/small laptop, and 1440px desktop.
- Spacing follows a 4/8px rhythm through responsive gutters.

## Form

- Visually hidden accessible field label, a restrained medium-weight email field, and an icon-only dotted-arrow submit control adapted from a 21st.dev interaction reference. Browser autofill remains fully transparent—no light or dark field fill—so the atmospheric background continues uninterrupted behind the typed address. The desktop form is slightly shorter than its invitation column.
- Validation, loading, error, success, and live-region feedback are preserved.
- Production endpoint is configured through the form’s `data-endpoint` attribute.

## Masthead and contact utilities

- The masthead participates in the normal page flow and scrolls away with the hero; it has no sticky layer, background panel or divider.
- Email and LinkedIn remain at the upper-right as small brand-green line icons inside restrained visual circles, with visible focus, descriptive accessible names, hover and press feedback.
- A quiet site signature sits centered beneath the event ledger: `© 2026 AGMENTIC · MUNICH`, set in tiny muted mono type.

## Assemblies ledger

- Event content continues the poster as a dark editorial ledger, never as a generic light card list or filter dashboard.
- The hero hands directly into the ledger through one divider and a short transition, never two rules separated by an empty band.
- Desktop event summaries use a compact, centered ledger no wider than 76rem, so roughly three summaries can remain visible in a typical viewport without sacrificing legibility.
- A!-Day and both Think Tank series use the same native accordion interaction; revealed panels hold event detail while registration remains pinned to the A!-Day summary.
- Expandability is signaled by a borderless cascade of three luminous downward chevrons at the end of each row. Their staggered glow suggests downward motion and the stack rotates 180° when opened.
- A!-Day keeps its guest-list link pinned in the summary in both open and closed states; the expanded panel contains explanation only.
- A!-Day’s explanation is a centered, wide editorial text block spanning the lower panel rather than a narrow left-side column.
- Upcoming gatherings carry the strongest type hierarchy. Status replaces registration controls: `Invitation only` for the online Series 02 gathering and `Details soon` where information is not yet public.
- AI Think Tanks Series 01 is recorded as a compact five-row archive: Zürich, München, Hamburg, Berlin and Stuttgart.
- Brand green marks sequence, status and dates; off-white typography and fine rules carry the remaining hierarchy.
- Desktop uses a two-column editorial rhythm. At ≤820px the introduction and archive recompose into single columns; at ≤640px event metadata stacks and nonessential archive status labels disappear.

## Motion

- No Motion dependency. CSS reveal choreography and pointer-fed CSS variables provide sufficient depth.
- Three headline lines reveal over a 160ms stagger; the masthead resolves quietly before them.
- The invitation enters as a short internal sequence: transmission metadata, statement, then functional form. Its signal rule draws in once.
- The beam resolves over 1.45 seconds, then a registration node locks into place with one acquisition pulse; only the beam breathes ambiently.
- Input focus draws a 280ms signal line. CTA hover/focus resolves the dotted transmission arrow forward and brightens its baseline; loading rotates only the mark.
- Pointer response moves only the atmosphere by 7–14px; no scroll-jacking or heavy parallax.
- The complete beam array twists slowly around the registration lock through restrained rotation, skew and horizontal compression over 10 seconds.
- On first load, the beam alone completes a one-time 350° arrival over 1.45 seconds, then hands off to the ambient twist without delaying interaction.
- The three circular guides drift independently by only 2–6px over 18–26 seconds, creating permanent ambient movement without drawing attention.
- All motion collapses under `prefers-reduced-motion`.

## Accessibility

- Semantic landmarks, single h1, skip link, visible labels, live form status, visible focus, and keyboard-native controls.
- CTA remains at least 44×44px; mobile input text is 16px.
- No meaning is communicated by color alone; error and success always include text.
- Zoom is enabled and all target widths avoid horizontal overflow.
