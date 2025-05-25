import {
    ApplicationCommandOptionTypes,
    type CreateSlashApplicationCommand,
} from "npm:@discordeno/types";
import { Bot, Interaction } from "npm:@discordeno/bot";

const data: CreateSlashApplicationCommand = {
    name: "onboard",
    description: "Onboard users to join a specific cohort",
    options: [{
        type: ApplicationCommandOptionTypes.String,
        name: "part",
        description:
            "Allows you to skip to parts of the onboarding process. This is useful when you have already done the onboarding process before.",
        choices: [
            {   
            }
        ]
        required: false,
    }],
};

export async function (bot: Bot, interaction: Interaction) {
    // interaction.data?.name
}
