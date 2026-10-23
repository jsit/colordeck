# ColorDeck

A slop-coded black box for color.

Paste a color in. Numbers come out. Drag sliders until something happens. Copy whichever number you need. Do not ask how the sausage converts.

Open `index.html`. No install, no build step, no dependencies. It handles HEX, RGB, HSL, HSV, LCH, OKLCH, and approximate CMYK; color names are nearest matches from X11's `rgb.txt`.

ColorDeck supports opaque colors only. HEX values with 4 or 8 digits and functional colors with alpha/transparency are rejected rather than silently converted.

Conversions are sRGB-based. Out-of-gamut chroma gets shoved back into sRGB. The color science is best-effort; the buttons are sincere.

The 658 X11 names' Lab coordinates are computed once during initialization. By operation count, 1,000 nearest-name searches previously parsed and converted all 658 swatches 1,000 times (658,000 swatch conversions); with the cache, they are parsed and converted only once (658 conversions), while each search still converts its input. This count follows directly from `colorNames.length * searches` versus `colorNames.length`; it is not a browser timing claim.
