# Third-party notices

bento/slides is MIT-licensed (© 2026 The Bento authors; see `LICENSE`).
The shippable single-file shell (`Bento_Slides.bento.html`) bundles the
following third-party components. Their license terms require that
these notices accompany copies, so the same text is embedded as a `NOTICE`
comment near the top of every built shell and every saved Bento document.

## Bundled runtime (ships inside the shell)

### Highcharts (this fork)
- Version: 13.1.1, pinned in slides/package-lock.json.
- Copyright (c) 2009-2026 Highsoft AS.
- License: Highsoft license terms, https://www.highcharts.com/license.
- This dependency is **not MIT-licensed**. The fork owner's organization has a
  commercial license; deployment and distribution must follow that agreement.
- Core, highcharts-more, xrange, exporting and accessibility are bundled in
  the single HTML shell. No CDN or external export service is needed.

### reveal.js
- License: MIT
- Copyright (C) 2011-2024 Hakim El Hattab, http://hakim.se, and reveal.js contributors
- Project: https://revealjs.com / https://github.com/hakimel/reveal.js
- Use: powers the present-mode fullscreen slideshow overlay.

### Moveable
- License: MIT
- Copyright (c) 2019 Daybrush (Younkue Choi)
- Project: https://github.com/daybrush/moveable
- Use: on-canvas element manipulation (drag / resize / rotate handles). Pulls in
  the author's supporting modules (`@daybrush/*`, `@scena/*`, `@egjs/*`,
  `@cfcs/*`), all MIT, © Daybrush.

### Selecto
- License: MIT
- Copyright (c) 2020 Daybrush (Younkue Choi)
- Project: https://github.com/daybrush/selecto
- Use: marquee / rubber-band selection on the editing canvas.

## Bundled fonts (embedded as document assets in decks that use them)

### Fraunces
- License: SIL Open Font License 1.1
- Copyright 2020 The Fraunces Project Authors
- Project: https://github.com/undercasetype/Fraunces

### Instrument Sans
- License: SIL Open Font License 1.1
- Copyright 2022 The Instrument Sans Project Authors
- Project: https://github.com/Instrument/instrument-sans

---

Full MIT license text is reproduced in the shell's `NOTICE` comment and in the
`LICENSE` file. The SIL Open Font License 1.1 text is available at
https://openfontlicense.org.

Dev-only tooling (Vite, TypeScript, `vite-plugin-singlefile`, `qrcode`,
`@types/*`) is used to build Bento but is **not** bundled into the shipped shell
and is therefore not listed here.
