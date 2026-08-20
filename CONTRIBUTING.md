# Contributing to AI Chat

Thanks for taking the time to contribute! AI Chat is a small, dependency-free
tool — keep it that way.

## Ways to contribute

- Report bugs and suggest features via [GitHub Issues](https://github.com/bestdeejay-design/aichat/issues)
- Ask questions in [Discussions](https://github.com/bestdeejay-design/aichat/discussions)
- Submit pull requests with fixes and improvements

## Getting started

```bash
git clone https://github.com/bestdeejay-design/aichat.git
cd aichat
python3 -m http.server 8080
# open http://localhost:8080
```

No build step, no dependencies — plain HTML/CSS/JS.

## Development conventions

- **Keep it dependency-free**: no frameworks, no npm packages, no build tools.
  Google Fonts is the only external resource.
- **Keep the structure flat**: `index.html`, `css/app.css`, `js/app.js`.
- **Design tokens**: colors/spacing live in `:root` CSS variables, no raw hex
  outside the token block.
- **UI text is Russian** (the interface targets Russian-speaking users).
- **Version badge**: bump `index.html` (`.ver` badge) on meaningful changes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add provider presets
fix: settings overlay resetting fields
docs: update quick start
```

## Pull request checklist

- [ ] Change is minimal and focused
- [ ] Works with the local server (`python3 -m http.server`)
- [ ] No new dependencies
- [ ] Version badge updated if user-facing behavior changed