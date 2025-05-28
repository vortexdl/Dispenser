import { Bot, Interaction } from "npm:@discordeno/bot";
import {
  ApplicationCommandOptionTypes,
  ApplicationCommandTypes,
  CreateSlashApplicationCommand,
} from "npm:@discordeno/types";
import { parseMarkdown } from "https://deno.land/x/markdown_wasm/mod.ts";
import { CommandConfig } from "../types/commands.d.ts";
import Responder from "../util/responder.ts";
import { accessConfig } from "../util/AccessConfig.ts";
import { getUserLocale } from "../util/getIfExists.ts";
import { join, dirname, fromFileUrl } from "https://deno.land/std/path/mod.ts";
import createErrorEmbed from "../util/createErrorEmbed.ts";

const data: CreateSlashApplicationCommand = {
  name: "legal",
  description: "Read legal documents like Terms of Service or Privacy Policy",
  type: ApplicationCommandTypes.ChatInput,
  options: [
    {
      type: ApplicationCommandOptionTypes.String,
      name: "document",
      description: "The legal document to read",
      required: true,
      choices: [
        { name: "Terms of Service", value: "tos" },
        { name: "Privacy Policy", value: "pp" },
      ],
    },
  ],
  dmPermission: true,
};

const commandConfig: CommandConfig = {
  managementOnly: false,
};

async function handle(bot: Bot, interaction: Interaction): Promise<void> {
  const responder = new Responder(bot, interaction.id, interaction.token);
  const userLocale = getUserLocale(interaction.user);

  const documentType = interaction.data?.options?.[0]?.value?.toLowerCase();

  let fileName: string;
  let title: string;

  switch (documentType) {
    case "tos":
    case "terms of service":
      fileName = "TERMS_OF_SERVICE.md";
      title = await accessConfig.getTranslation(
        {
          type: "in_command",
          searchString: "Terms of Service",
          commandTarget: "legal",
          isEmbed: true,
        },
        userLocale
      );
      break;
    case "pp":
    case "privacy policy":
      fileName = "PRIVACY_POLICY.md";
      title = await accessConfig.getTranslation(
        {
          type: "in_command",
          searchString: "Privacy Policy",
          commandTarget: "legal",
          isEmbed: true,
        },
        userLocale
      );
      break;
    default:
      await responder.respondEmbed(
        await createErrorEmbed(
          "Invalid document type. Please choose `Terms of Service` or `Privacy Policy`.",
          "user_error",
          userLocale,
        ),
      );
      return;
  }

  try {
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const filePath = join(currentDir, '..', '..', 'legal', fileName);
    
    const data = await Deno.readFile(filePath);
    const decoder = new TextDecoder("utf-8");
    const fileContent = decoder.decode(data);
    
    const parsedContent = parseMarkdown(fileContent);
    const contentWithoutTitle = parsedContent.split('\n').slice(1).join('\n');

    const embed = {
      title: title,
      description: contentWithoutTitle.slice(0, 4096),
      color: 0x0099ff,
    };

    await responder.respondEmbed(embed);

    // multiple msg incase tos or pp gets too long
    if (contentWithoutTitle.length > 4096) {
      const chunks = contentWithoutTitle.match(/.{1,2000}/g) || [];
      for (let i = 1; i < chunks.length; i++) {
        await responder.respond(chunks[i]);
      }
    }
  } catch (error) {
    console.error(`error: ${error}`);
    await responder.respondEmbed(
      await createErrorEmbed(
        await accessConfig.getTranslation(
          {
            type: "in_command",
            searchString: "error happened. please report to developer. try again later.",
            commandTarget: "legal",
            isEmbed: false,
          },
          userLocale
        ),
        "bot_error",
        userLocale,
      ),
    );
  }
}

export { commandConfig, data, handle };