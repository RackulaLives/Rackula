# Asset Directories

This project uses three directories for different types of assets:

| Directory | Purpose | Examples |
| --- | --- | --- |
| `assets/` | Brand materials for docs/README | Lockups, icons, hero GIF |
| `assets-source/` | Raw device images before processing | Unprocessed hardware photos |
| `static/` | Web-served static files | Favicons, fonts, badges, brand SVGs |

## Guidelines

- **`assets/`** — Files referenced in `README.md`, GitHub social previews, and documentation. Not served by the web app.
- **`assets-source/`** — Source images that get processed (resized, optimised, converted) before being copied to `static/`. The build pipeline reads from here.
- **`static/`** — SvelteKit's static directory. Anything here is served as-is at the site root. Vite/SvelteKit reads this directory directly.
