import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  type Interaction,
  type TextChannel,
  type VoiceChannel,
  type GuildMember,
  type VoiceState,
  type Guild,
  type Message,
} from "discord.js";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = resolve(__dirname, "../.bot-state.json");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
if (!TOKEN) throw new Error("DISCORD_BOT_TOKEN environment variable is not set");

// ─── Constants ───────────────────────────────────────────────────────────────

const EMBED_COLOR = 0x0a4939;

// Self-role system
const SELF_ROLE_CHANNEL_ID = "1488442875082707015";

// Verification system
const VERIFICATION_JOIN_VC    = "1488479913341095937";
const STAFF_PING_CHANNEL_ID  = "1488478458328645692";
const STAFF_ROLE_ID          = "1488949722210238464";
const VERIFIED_ROLE_ID       = "1488521626059542538";

// ?ve command roles
const VP_ROLE_ID              = "1488521626059542538";
const MALE_ROLE_ID            = "1488521698973061283";
const FEMALE_ROLE_ID          = "1488521734171656282";
const REMOVE_ROLE_ID          = "1488628569990238329";

// Users allowed to use ?ve command
const ALLOWED_CMD_USERS = new Set([
  "1275794255692042242",
  "1078355674498609172",
  "961981929589186601",
  "859087100687417365",
  "1228125551307395145",
]);

// ─── Self-role data ───────────────────────────────────────────────────────────

const GAMES_ROLES: Record<string, string> = {
  "Free Fire":       "1488941273489608724",
  "Valorant":        "1488941349850976416",
  "Minecraft":       "1488941349850976416",
  "Counter Strike 2":"1488941583368851476",
  "FiveM":           "1488941648292352120",
  "Call Of Duty":    "1488941792396316923",
  "Roblox":          "1488941846108573868",
  "Blood Strike":    "1488941888345215148",
  "Among Us":        "1488941941197504613",
  "Stumble Guys":    "1488941984440914151",
  "E Football":      "1488942047581966346",
};

const RELATIONSHIP_ROLES: Record<string, string> = {
  "In a Relationship": "1488942111578394895",
  "Single":            "1488942179337633944",
  "Its Complicated":   "1488942226636800123",
};

const AGE_ROLES: Record<string, string> = {
  "( 14 - 18 )": "1488942288582349082",
  "( 18 - 22 )": "1488942548402573382",
  "+ 22":         "1488942635606474905",
};

// ─── Runtime state ────────────────────────────────────────────────────────────
// userId → temp voice channel id
const tempChannels = new Map<string, string>();
// userId → number of pings sent
const pingCounts = new Map<string, number>();

// ─── Persistent state (for self-role message) ─────────────────────────────────

function loadState(): { messageId?: string } {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, "utf8"));
    }
  } catch {}
  return {};
}

function saveState(state: { messageId?: string }) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch {}
}

// ─── Embed helpers ────────────────────────────────────────────────────────────

function footerData(guild: Guild) {
  const now = new Date();
  const time = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return {
    text: `${guild.name} | ${time}`,
    iconURL: guild.iconURL() ?? undefined,
  };
}

function buildSelfRoleEmbed(guild: Guild) {
  const description = [
    "__**🧩 Choose Your Roles :**__",
    "",
    "**・Use the buttons below to explore different categories and customize your profile.**",
    "",
    "__**🎮 Games :**__",
    "**Select the games you enjoy playing.**",
    "",
    "__**❤️ Relationship Status :**__",
    "**Pick the option that best represents you.**",
    "",
    "__**🎂 Age :**__",
    "**Choose your age group.**",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setFooter(footerData(guild));
}

function buildSelfRoleButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("btn_games")
      .setLabel("🎮 Games")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("btn_relationship")
      .setLabel("❤️ Relationship Status")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("btn_age")
      .setLabel("🎂 Age")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildVerificationRoomEmbed(guild: Guild) {
  const description = [
    "__**🔐 Verification in Progress**__",
    "",
    "**Welcome! You are currently waiting to be verified by our staff team.**",
    "",
    "**Please be patient! a staff member will join you shortly to complete the process.**",
    "**Make sure to stay in this voice channel.**",
    "",
    "**If it's taking too long, you can use the button below to notify staff.**",
    "",
    "__**Thank you for your patience 🤝**__",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setFooter(footerData(guild));
}

function buildPingStaffButton(userId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`ping_staff:${userId}`)
      .setLabel("Ping Staff")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildMaxPingsEmbed(guild: Guild) {
  const description = [
    "__**⚠️ Maximum Pings Reached**__",
    "",
    "**You have used all your available staff pings.**",
    "",
    "**Please wait patiently! a staff member will be with you as soon as possible.**",
    "",
    "**Avoid leaving the channel to keep your place in queue.**",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setFooter(footerData(guild));
}

function buildStaffPingEmbed(guild: Guild) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription("**Someone is waiting for verification**")
    .setFooter(footerData(guild));
}

function buildVerifiedDmEmbed(guild: Guild, member: GuildMember) {
  const description = [
    "__**✅ Verification Complete**__",
    "",
    "**You have been successfully verified!**",
    "",
    "**You now have full access to the server.**",
    "**Feel free to explore, chat, and enjoy your stay.**",
    "",
    "**If you need any help, don't hesitate to contact the staff team.**",
    "",
    "__**Welcome To /Wrong Turn   | Tn.**__",
  ].join("\n");

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(description)
    .setThumbnail(member.displayAvatarURL({ size: 256 }))
    .setFooter(footerData(guild));
}

function buildConfirmEmbed(description: string) {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(description);
}

// ─── Select menu builders ─────────────────────────────────────────────────────

function buildGamesMenu() {
  const options = Object.entries(GAMES_ROLES).map(([name]) =>
    new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId("select_games")
    .setPlaceholder("Select the games you play...")
    .setMinValues(0)
    .setMaxValues(options.length)
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildRelationshipMenu() {
  const options = Object.entries(RELATIONSHIP_ROLES).map(([name]) =>
    new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId("select_relationship")
    .setPlaceholder("Pick your relationship status...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildAgeMenu() {
  const options = Object.entries(AGE_ROLES).map(([name]) =>
    new StringSelectMenuOptionBuilder().setLabel(name).setValue(name),
  );
  const menu = new StringSelectMenuBuilder()
    .setCustomId("select_age")
    .setPlaceholder("Choose your age group...")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

// ─── Cleanup helper ───────────────────────────────────────────────────────────

async function cleanupUserVerification(userId: string) {
  const channelId = tempChannels.get(userId);
  if (channelId) {
    try {
      const ch = await client.channels.fetch(channelId).catch(() => null);
      if (ch) await ch.delete().catch(() => {});
    } catch {}
    tempChannels.delete(userId);
  }
  pingCounts.delete(userId);
}

// ─── Client ───────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ─── Ready ────────────────────────────────────────────────────────────────────

client.once("clientReady", async () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);

  try {
    const channel = (await client.channels.fetch(SELF_ROLE_CHANNEL_ID)) as TextChannel;
    if (!channel?.isTextBased()) {
      console.error("[Bot] Self-role channel not found or not text-based");
      return;
    }

    const guild = channel.guild;
    const embed = buildSelfRoleEmbed(guild);
    const buttons = buildSelfRoleButtons();
    const state = loadState();

    if (state.messageId) {
      try {
        const existing = await channel.messages.fetch(state.messageId);
        if (existing?.author.id === client.user?.id) {
          await existing.edit({ embeds: [embed], components: [buttons] });
          console.log("[Bot] Self-role message updated.");
          return;
        }
      } catch {
        console.log("[Bot] Stored message gone, sending fresh.");
      }
    }

    const msg = await channel.send({ embeds: [embed], components: [buttons] });
    saveState({ messageId: msg.id });
    console.log(`[Bot] Self-role message sent (ID: ${msg.id})`);
  } catch (err) {
    console.error("[Bot] Error in clientReady:", err);
  }
});

// ─── Voice state update (verification system) ─────────────────────────────────

client.on("voiceStateUpdate", async (oldState: VoiceState, newState: VoiceState) => {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const guild = newState.guild ?? oldState.guild;
  const userId = member.id;

  // User joined the verification entry VC
  if (
    newState.channelId === VERIFICATION_JOIN_VC &&
    oldState.channelId !== VERIFICATION_JOIN_VC
  ) {
    // Don't create another if they already have one
    if (tempChannels.has(userId)) return;

    try {
      const joinChannel = await guild.channels.fetch(VERIFICATION_JOIN_VC).catch(() => null) as VoiceChannel | null;
      const categoryId = joinChannel?.parentId ?? null;

      const tempVC = await guild.channels.create({
        name: `☑️・${member.displayName} Verification`,
        type: ChannelType.GuildVoice,
        parent: categoryId ?? undefined,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
          },
          {
            id: REMOVE_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
            ],
          },
          {
            id: userId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.UseVAD,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
            ],
          },
          {
            id: STAFF_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.Speak,
              PermissionFlagsBits.MuteMembers,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.SendMessages,
            ],
          },
          {
            id: client.user!.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.Connect,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.MoveMembers,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
            ],
          },
        ],
      });

      tempChannels.set(userId, tempVC.id);
      pingCounts.set(userId, 0);

      // Move user into temp VC
      await member.voice.setChannel(tempVC).catch(console.error);

      // Send verification embed in the temp VC's text-in-voice
      await (tempVC as unknown as TextChannel).send({
        embeds: [buildVerificationRoomEmbed(guild)],
        components: [buildPingStaffButton(userId)],
      });

      console.log(`[Bot] Created temp VC ${tempVC.id} for ${member.displayName}`);
    } catch (err) {
      console.error("[Bot] Error creating temp VC:", err);
    }
    return;
  }

  // User left a temp VC (they disconnected from voice entirely or moved away)
  if (
    oldState.channelId &&
    oldState.channelId !== VERIFICATION_JOIN_VC &&
    tempChannels.get(userId) === oldState.channelId &&
    newState.channelId !== oldState.channelId
  ) {
    console.log(`[Bot] ${member.displayName} left their temp VC, cleaning up...`);
    await cleanupUserVerification(userId);
  }
});

// ─── Guild member update (detect verified role being assigned) ────────────────

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  const hadRole = oldMember.roles.cache.has(VERIFIED_ROLE_ID);
  const hasRole = newMember.roles.cache.has(VERIFIED_ROLE_ID);

  if (!hadRole && hasRole) {
    // Send DM
    try {
      const dmChannel = await newMember.createDM();
      await dmChannel.send({
        embeds: [buildVerifiedDmEmbed(newMember.guild, newMember)],
      });
      console.log(`[Bot] Sent verification DM to ${newMember.displayName}`);
    } catch (err) {
      console.error("[Bot] Could not send DM to member:", err);
    }

    // Clean up their temp verification channel
    await cleanupUserVerification(newMember.id);
  }
});

// ─── Helper: reply and auto-delete after delay ────────────────────────────────

async function replyAndDelete(
  message: Message,
  options: Parameters<Message["reply"]>[0],
  delayMs = 5000,
) {
  const reply = await message.reply(options);
  setTimeout(() => reply.delete().catch(() => {}), delayMs);
  setTimeout(() => message.delete().catch(() => {}), delayMs);
}

// ─── Message create (?ve command) ─────────────────────────────────────────────

client.on("messageCreate", async (message: Message) => {
  try {
  if (message.author.bot) return;
  if (!message.content.startsWith("?ve")) return;

  console.log(`[Bot] ?ve message received from ${message.author.id}: "${message.content}"`);

  if (!message.content.startsWith("?ve ")) return;
  if (!ALLOWED_CMD_USERS.has(message.author.id)) {
    console.log(`[Bot] Unauthorized user tried ?ve: ${message.author.id}`);
    return;
  }

  const args = message.content.slice("?ve ".length).trim().split(/\s+/);
  const mention = message.mentions.members?.first();
  const action = args.find((a) => !a.startsWith("<"));

  if (!mention) {
    await replyAndDelete(message, { content: "**Please mention a valid user.**" });
    return;
  }

  if (!action) {
    await replyAndDelete(message, { content: "**Please provide an action: `vp`, `male`, `female`, or `new`.**" });
    return;
  }

  const guild = message.guild;
  if (!guild) return;

  switch (action.toLowerCase()) {
    case "vp": {
      await mention.roles.add(VP_ROLE_ID);
      await replyAndDelete(message, {
        embeds: [buildConfirmEmbed(`✅ **Gave <@${mention.id}> the Verified Person role.**`)],
      });
      break;
    }
    case "male": {
      await mention.roles.add(MALE_ROLE_ID);
      await replyAndDelete(message, {
        embeds: [buildConfirmEmbed(`✅ **Gave <@${mention.id}> the Male role.**`)],
      });
      break;
    }
    case "female": {
      await mention.roles.add(FEMALE_ROLE_ID);
      await replyAndDelete(message, {
        embeds: [buildConfirmEmbed(`✅ **Gave <@${mention.id}> the Female role.**`)],
      });
      break;
    }
    case "new": {
      await mention.roles.remove(REMOVE_ROLE_ID);
      await replyAndDelete(message, {
        embeds: [buildConfirmEmbed(`✅ **Removed the New role from <@${mention.id}>.**`)],
      });
      break;
    }
    default: {
      await replyAndDelete(message, {
        content: "**Unknown action. Use `vp`, `male`, `female`, or `new`.**",
      });
    }
  }
  } catch (err) {
    console.error("[Bot] messageCreate error:", err);
    try {
      await message.reply({ content: "**Something went wrong. Check my permissions.**" });
    } catch {}
  }
});

// ─── Interaction create ───────────────────────────────────────────────────────

client.on("interactionCreate", async (interaction: Interaction) => {
  try {
  // ── Button interactions ──
  if (interaction.isButton()) {
    const { customId } = interaction;

    // Ping staff button
    if (customId.startsWith("ping_staff:")) {
      const ownerId = customId.split(":")[1];
      const interactingUserId = interaction.user.id;

      // Only the owner of that temp channel can press this
      if (interactingUserId !== ownerId) {
        await interaction.reply({
          content: "**This button is not for you.**",
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const guild = interaction.guild;
      if (!guild) return;

      const count = pingCounts.get(ownerId) ?? 0;

      if (count >= 2) {
        // Already maxed
        await interaction.reply({
          embeds: [buildMaxPingsEmbed(guild)],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      const newCount = count + 1;
      pingCounts.set(ownerId, newCount);

      // Ping staff in staff channel
      try {
        const staffChannel = await guild.channels.fetch(STAFF_PING_CHANNEL_ID).catch(() => null) as TextChannel | null;
        if (staffChannel?.isTextBased()) {
          await staffChannel.send({
            content: `<@&${STAFF_ROLE_ID}>`,
            embeds: [buildStaffPingEmbed(guild)],
          });
        }
      } catch (err) {
        console.error("[Bot] Error pinging staff channel:", err);
      }

      if (newCount === 1) {
        // First ping — ephemeral reply, keep button active
        await interaction.reply({
          content: "**Staff has been notified. You have 1 ping left.**",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        // Second (final) ping — disable button via update(), then send max pings embed
        const disabledRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`ping_staff:${ownerId}`)
            .setLabel("Ping Staff")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        );
        // update() acknowledges the interaction AND edits the original message
        await interaction.update({ components: [disabledRow] });

        // Send max pings embed as a new message in the same channel
        const ch = interaction.channel;
        if (ch?.isTextBased()) {
          await (ch as TextChannel).send({
            embeds: [buildMaxPingsEmbed(guild)],
          });
        }
      }
      return;
    }

    // Self-role buttons
    if (customId === "btn_games") {
      await interaction.reply({
        embeds: [buildConfirmEmbed("**🎮 Select the games you enjoy playing:**")],
        components: [buildGamesMenu()],
        flags: MessageFlags.Ephemeral,
      });
    } else if (customId === "btn_relationship") {
      await interaction.reply({
        embeds: [buildConfirmEmbed("**❤️ Pick the option that best represents you:**")],
        components: [buildRelationshipMenu()],
        flags: MessageFlags.Ephemeral,
      });
    } else if (customId === "btn_age") {
      await interaction.reply({
        embeds: [buildConfirmEmbed("**🎂 Choose your age group:**")],
        components: [buildAgeMenu()],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  // ── Select menu interactions ──
  if (interaction.isStringSelectMenu()) {
    const member = interaction.member as GuildMember;
    if (!member) {
      await interaction.reply({ content: "Could not find your member data.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferUpdate();

    if (interaction.customId === "select_games") {
      const selected = new Set(interaction.values);
      const allGameRoleIds = new Set(Object.values(GAMES_ROLES));

      for (const roleId of allGameRoleIds) {
        const shouldHave = [...selected].some((name) => GAMES_ROLES[name] === roleId);
        const hasRole = member.roles.cache.has(roleId);
        if (shouldHave && !hasRole) await member.roles.add(roleId).catch(console.error);
        else if (!shouldHave && hasRole) await member.roles.remove(roleId).catch(console.error);
      }

      const roleNames =
        interaction.values.length > 0
          ? interaction.values.map((v) => `**${v}**`).join(", ")
          : "*(no games selected)*";

      await interaction.editReply({
        embeds: [buildConfirmEmbed(`✅ **Your role has been updated**\n\n🎮 Games: ${roleNames}`)],
        components: [],
      });
    } else if (interaction.customId === "select_relationship") {
      const selectedName = interaction.values[0];
      const selectedId = RELATIONSHIP_ROLES[selectedName];
      for (const roleId of Object.values(RELATIONSHIP_ROLES)) {
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId).catch(console.error);
      }
      if (selectedId) await member.roles.add(selectedId).catch(console.error);

      await interaction.editReply({
        embeds: [buildConfirmEmbed(`✅ **Your role has been updated**\n\n❤️ Relationship Status: **${selectedName}**`)],
        components: [],
      });
    } else if (interaction.customId === "select_age") {
      const selectedName = interaction.values[0];
      const selectedId = AGE_ROLES[selectedName];
      for (const roleId of Object.values(AGE_ROLES)) {
        if (member.roles.cache.has(roleId)) await member.roles.remove(roleId).catch(console.error);
      }
      if (selectedId) await member.roles.add(selectedId).catch(console.error);

      await interaction.editReply({
        embeds: [buildConfirmEmbed(`✅ **Your role has been updated**\n\n🎂 Age: **${selectedName}**`)],
        components: [],
      });
    }
  }
  } catch (err) {
    console.error("[Bot] Interaction handler error:", err);
  }
});

// ─── Global error protection ──────────────────────────────────────────────────

client.on("error", (err) => {
  console.error("[Bot] Client error:", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Bot] Unhandled rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("[Bot] Uncaught exception:", err);
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(TOKEN);
