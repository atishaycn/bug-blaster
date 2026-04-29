# Bug Blaster

A lightweight browser-based side-scrolling Canvas game inspired by the Chrome T-Rex runner, with automatic shooting, bugs, hurdles, power-ups, and parallax scenery.

## Run

Open `index.html` in a browser. No build step, dependencies, or server are required.

For the shared leaderboard API, run through Vercel:

```bash
vercel dev
```

## Controls

- `Space`: jump
- `Enter`: start or restart
- `P`: pause or unpause
- `M`: mute or unmute
- Touch or click the canvas: jump, start, or restart

## Gameplay

Survive as long as possible while the world scrolls from right to left. The runner jumps over indestructible hurdles, automatically shoots bugs, and collects bobbing power-ups. Difficulty ramps quickly as world speed rises and spawn intervals shorten.

Collector bosses appear at random times during a run. They float through the lane, take multiple shots to destroy, show a health bar, and get larger, tougher, faster, and more valuable as the game progresses.

## Leaderboard

The game stores a shared top-10 leaderboard through `/api/scores` when deployed on Vercel. It falls back to `localStorage` if the API is unavailable. When a game-over score qualifies for the top 10, the player enters three initials with the keyboard and presses `Enter` to save. The leaderboard is rendered in a neon arcade dot-matrix style on the start and game-over overlays.

## Power-Ups

- Rapid Fire: lowers the fire interval for 8 seconds.
- Shield: blocks one collision.
- Spread Shot: fires three bullets for 8 seconds.
- Health: restores 1 health up to the max of 3.
- Score Boost: doubles passive and bug score gains for 8 seconds.

## Asset Strategy

The game uses only plain HTML, CSS, JavaScript, and the HTML5 Canvas API. Art is kept lightweight with compact generated SVG files in `assets/` for the player, bugs, Collector boss, hurdles, power-up icons, UI badge, and reusable parallax scenery. Animation is code-driven through bobbing, parallax motion, recoil, wing flaps, and simple Canvas effects, avoiding heavy raster sheets or external libraries.

## Notes

High score and fallback leaderboard entries are stored in `localStorage`. In production, `/api/scores` uses Vercel KV or Upstash Redis REST environment variables when available. Sound effects are generated with the Web Audio API and do not require audio files. Set `DEBUG` to `true` in `game.js` to draw hitboxes.
