# cGame Operating Brief

## Purpose

This repository contains `Bug Blaster`, a lightweight browser Canvas side-scroller inspired by the Chrome T-Rex runner. It runs directly from `index.html` with no build step.

## Important Files

- `index.html`: page shell, canvas, and controls.
- `styles.css`: responsive page layout and chrome around the canvas.
- `game.js`: gameplay state, update loop, rendering, audio, spawning, collisions, and leaderboard client sync.
- `api/scores.js`: Vercel serverless function for shared top-10 score persistence, using KV/Upstash REST env vars in production and `.data/scores.json` locally.
- `assets/`: small SVG assets used by the Canvas renderer.
- `README.md`: user-facing run and gameplay notes.

## Run And Verify

Open `index.html` in Chrome for pure local play, or use `npm run dev` to verify the shared `/api/scores` backend. Verification should include start, spacebar jump, touch/click jump, auto-fire, bug destruction, Collector boss spawning/damage, hurdle damage, power-up collection, pause, mute, game over, top-10 leaderboard initials entry, backend score persistence, restart, resize, and localStorage fallback behavior.

## Boundaries

Keep the project plain HTML, CSS, and JavaScript. Do not add React, TypeScript, Phaser, Pixi, bundlers, or heavy third-party libraries. Prefer compact SVG assets and code-driven animation.
