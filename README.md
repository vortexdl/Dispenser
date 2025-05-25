# Dispenser

## Features

- Smart Link Distribution - Never get a blocked or duplicate link ever again,
  and immediately be automatically issued a new link if your old link gets
  blocked, depending on your filter configuration (Intelligent Cohort System)
- Autocomplete (with Heuristics)
- Category Management
- Link-leaking Prevention (with audits that inform both parties)
- Global Proxy Site Search Engine
- Global Proxy Site Rankings
- Advanced User Management (Banning, Limit Resets/Modification, etc...)
- Add to Account with DM/GC features
- User Link History
- Everything Configurable (including the panel!)
- Premium Links
- Export Link Lists (CSV, XML, JSON)
- Mass-import Link Lists
- Advanced Config System
- Masqr Integration
- Properietary Filter Lock Integration _SOON_
- Hotswappable Commands (for perfect uptime)

## Getting started (basics)

### Creating your first link

`/link add (PROXY LINK) (CATEGORY)`

> Don't worry about the category, since it will automatically create one for you

### Creating a link panel

Create a new channel, lock it from messages, and then run `/panel`

## Hosting Guide

### 1: Setting up MongoDB

Reference
[this](https://www.mongodb.com/docs/manual/administration/install-on-linux)

### 2: Setting up the bot

#### Setting up the config

```
mv config.example.ts config.ts
```

then, insert your respective bot information

#### Starting the bot

Run `deno task start`
