We store website links your server admins put into the bot's database\* via the
`/link add` subcommand\*, where your links are viewable by whoever in your
Discord server you choose to reveal them to. We may collect your server members'
data through crowdsourcing, where your server members may anonymously or
publicly submit information. We give your server members no obligation for their
Discord members to do this. Still, as a Dispenser manager\*, you may provide
rewards that encourage it in a way similar to premium features. This data is
stored in a Dispenser's central server\* database\*, hosted by Vertex Cloud\*,
and sent out through a public API. The data here is collected to improve the
user experience of Filter Lockâ" ¢\*. Dispenser managers\* can also prevent your
Discord server's members from engaging in this process through the `/config`
command\*. The process is entirely optional and is only there to enhance the
accuracy of our other service. Your Discord server members may inform us about
the network filters or content blockers they are affected by for the Dispenser
bot. They will have this ability if a Dispenser manager\* runs the command
`/panel,` which, by design, asks the Discord server member to specify the
filters if they choose to. The Discord server members benefit by receiving more
relevant and personalized links sent to them when they interact\* with the bot
and click the buttons on the panel created by `/panel.` You can view the
Dispenser bot's privacy policy anytime through the `/privacy-policy` command.
The bot is open-sourced at the web URL.
"https://github.com/VyperGroup/dispenser," meaning anyone can audit the source
code currently live on our servers other than the bot config\* in the file
"config.ts" as that includes the sensitive API Tokens, which would compromise
the Dispenser Bot's security. An announcement would be announced in the "Vyper
Group" Discord server if there is a security breach. As a Discord server member
with the Dispenser bot, you can run the command\* `/view-config` inside the
server to see precisely how the Dispenser managers\* have chosen to configure
their bot compared to the defaults in the global instance config\*. Dispenser
managers\* cannot turn off\* this command, nor will we.

- The "bot config" refers to a file where the API Tokens are required to set up
  an instance of the bot stored. These API Tokens are, in our case, the
  Dispenser Bot's Discord Token, Dispenser Bot Canary's Discord Token, and the
  Mongo DB Atlas API Token to connect to the remote database\*. You can see how
  we may configure the bot config by looking in the file "index.d.ts," which
  provides documentation.
- The "global instance config" is the file we configure that controls how the
  bot should interact* by default with no changes to the configuration from
  Dispenser managers*.
- Turning off a command\* prevents the Discord member from running a command
  while the bot is still online in this context.
- A "Dispenser manager" refers to a Discord member permitted by Discord members
  who have the "administration" permissions in the Discord server and can
  configure Dispenser's functionality.
- Database\* refers to the medium of storage sourced from MongoDB's Atlas
  servers hosted by "MongoDB, Inc." for our data, and certain records may be
  copied to the RAM of our Dispenser server.
- Our named hosting providers may access the data at any time. We reserve the
  right to change the hosting providers as we see fit. If this happens, we will
  notify you of the change in our "Vyper Group" Discord server\* in the
  announcements channel and update our privacy policy before the change. In
  addition, before the change occurs. We can't guarantee prompt notice if our
  hosting providers are acquired.
- Filter Lockâ" ¢ is another free and open-source service we offer that intends
  to use our APIs. Anybody can host their instance of it.
- When a user runs a Discord command, which is the only way to interact\* with
  the Dispenser bot at this time, it will result in a notice the user must read
  and acknowledge before the Discord bot gives its calculated response to the
  the following response if it is their first time using the bot. When the user
  recognizes it, they will resume regular bot interaction.
- "interact" refers to providing the bot inputs to process in this context.
  "calculated response" means that the bot has read the inputs and has already
  processed them in the code. "command" refers to a "slash command" interaction.
  As explained by Discord,
  "https://support.discord.com/hc/en-us/articles/1500000368501-Slash-Commands-FAQ".
- The "Vyper Group" Discord server is where we send essential notices relevant
  to our users. It is accessible at https://discord.gg/nowgg at this time.
