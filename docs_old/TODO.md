# TODOs

# Last changes before V3 updated

- [ ] Port to [NodeJS](https://nodejs.org/en) and [Bun](https://bun.sh), while
      maintaining [Deno](https://deno.com) compatibility.
  - [ ] Make import maps to runtimes other than Node that redirect the imports
        to NPM to their native alernatives, so they don't have to rely on NodeJS
        emulation
    - [ ] Upgrade Discordeno 13 imports to 17, and replace it to the
          "discordeno" NPM import
  - [ ] Finish the start scripts for the alternative runtimes
- [ ] Implement [Enchanced logging functionality](./Logging.md):
  - [ ] Add channel logging
  - [ ] Colorize the output in the server logs by using a proper logger
- [x] Implement [fault tolerance](./Fault%20tolerance.md):
  - [x] Implement it in the bot itself
  - [x] Implement the APIs
- TODO: ...

## Documentation

- [ ] Explain how to make and use a systemd service for Dispenser - Flyaway
