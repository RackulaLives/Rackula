<p align="center">
  <a href="https://count.racku.la">
    <img src="assets/Rackula-lockup-dark.svg#gh-dark-mode-only" alt="Rackula" width="420">
    <img src="assets/Rackula-lockup-light.svg#gh-light-mode-only" alt="Rackula" width="420">
  </a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-bd93f9?style=for-the-badge&labelColor=44475a" alt="License: MIT"></a>
  <img src="https://img.shields.io/github/v/release/RackulaLives/Rackula?style=for-the-badge&labelColor=44475a&color=ff79c6" alt="GitHub Release">
  <a href="https://github.com/RackulaLives/Rackula/pkgs/container/Rackula"><img src="https://img.shields.io/github/v/release/RackulaLives/Rackula?style=for-the-badge&labelColor=44475a&color=50fa7b&label=docker&logo=docker&logoColor=white" alt="Docker"></a>
</p>

<p align="center">
  <strong>Drag and drop rack visualizer</strong>
</p>

// insert hero images here

---

## What _Is_ This

Plan your rack layout. Drag your devices in, move them around, export it. It runs in your browser. You can close the tab whenever you want.

## What It _Do_

- **Drag and drop devices** into your rack so you can frown at them
- **Real device images** so it actually looks like your gear, not sad grey boxes
- **Export to PNG, PDF, SVG** for your documentation or for printing and staring at
- **QR code sharing** - your layout lives in a URL, scan it and it just shows up

## Get Started

**Use it right now:** [count.racku.la](https://count.racku.la)

**Selfhost with Docker**

Run: 

```bash
docker run -d -p 8080:80 ghcr.io/RackulaLives/Rackula:latest
```

Or Compose:

```bash
curl -O https://raw.githubusercontent.com/RackulaLives/Rackula/main/docker-compose.yml
docker compose up -d
```

Then open `http://localhost:8080` and get after it.

**Build from source:**

```bash
git clone https://github.com/RackulaLives/Rackula.git
cd Rackula && npm install && npm run build
```

Serve the `dist/` folder however you like. It's just files.

## Documentation

- [Architecture Overview](docs/reference/ARCHITECTURE.md)
- [Technical Specification](docs/reference/SPEC.md)
- [Contributing Guide](CONTRIBUTING.md)

## Built With Claude

This project was built using AI-assisted development with Claude. I told it what to build and then said "no, not like that" a lot. The AI did a lot of typing. Commits with substantial AI contributions are marked with `Co-authored-by` tags because we're not going to pretend otherwise.

## Acknowledgements

Built for the [r/homelab](https://reddit.com/r/homelab) and [r/selfhosted](https://reddit.com/r/selfhosted) communities.

Device types and images ~~are stolen from~~ are compatible with the [NetBox devicetype-library](https://github.com/netbox-community/devicetype-library) because why reinvent that wheel.

## Licence

[MIT](LICENSE) - Copyright (c) 2025 Gareth Evans
