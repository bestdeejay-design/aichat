# Changelog

All notable changes to this project are documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-08-21

### Added

- Onboarding: "Get a key →" links per provider (GitHub Models, DeepSeek,
  OpenRouter, OpenAI, Groq) in settings
- Privacy hint on the start screen ("key stays in your browser")
- "Delete key and settings" button — wipes localStorage (key, models, chat)
- Error hints on connection failures ("Check the key and endpoint")
- README.md (EN) + README.ru.md with setup instructions and key table
- Community files: LICENSE (MIT), CODE_OF_CONDUCT, CONTRIBUTING, SECURITY,
  SUPPORT, issue/PR templates

### Fixed

- Selecting a provider on the start screen no longer resets the settings
  form fields (loadSettings was overwriting quickConnect values)

## [1.1.1] - 2026-08-19

### Added

- Stable prototype: multi-provider support (GitHub Models, DeepSeek,
  OpenRouter, OpenAI, Groq, custom OpenAI-compatible endpoints)
- Streaming responses with stop generation
- Auto model selection, chat history (100 messages), system prompt,
  temperature, max tokens
- Dark theme, mobile layout