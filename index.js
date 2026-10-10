
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActivityType
} = require("discord.js");

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const commands = [
  new SlashCommandBuilder()
    .setName("countdown")
    .setDescription("Start the mysterious countdown"),

  new SlashCommandBuilder()
    .setName("holidays")
    .setDescription("See which holidays are supported")
].map(command => command.toJSON());

// Calculate Easter Sunday.
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);

  return new Date(
    year,
    month - 1,
    ((h + l - 7 * m + 114) % 31) + 1
  );
}

function nthWeekday(year, month, weekday, n) {
  const first = new Date(year, month, 1);

  return new Date(
    year,
    month,
    1 + ((weekday - first.getDay() + 7) % 7) + 7 * (n - 1)
  );
}

// These dates are used internally. Holiday names are never
// shown in the countdown thread.
function getHolidays(year) {
  return [
    { date: new Date(year, 0, 1) },
    { date: new Date(year, 1, 14) },
    { date: new Date(year, 2, 17) },
    { date: easterDate(year) },
    { date: new Date(year, 9, 31) },
    { date: nthWeekday(year, 10, 4, 4) },
    { date: new Date(year, 11, 25) }
  ];
}

function getNextHoliday() {
  const now = new Date();

  return [
    ...getHolidays(now.getFullYear()),
    ...getHolidays(now.getFullYear() + 1)
  ]
    .map(holiday => holiday.date)
    .filter(date => date > now)
    .sort((a, b) => a - b)[0];
}

function formatCountdown(target) {
  const remaining = Math.max(0, target.getTime() - Date.now());

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return [
    `**${days}** days`,
    `**${String(hours).padStart(2, "0")}** hours`,
    `**${String(minutes).padStart(2, "0")}** minutes`,
    `**${String(seconds).padStart(2, "0")}** seconds`
  ].join(" · ");
}

function timerContent(target) {
  return [
    "A countdown to death? God? a secret we all don't know? we have to see...",
    "",
    "⏳ **COUNTDOWN**",
    formatCountdown(target)
  ].join("\n");
}

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  client.user.setPresence({
    activities: [{
      name: "the countdown 👁️",
      type: ActivityType.Watching
    }],
    status: "online"
  });

  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  try {
    await rest.put(
      Routes.applicationGuildCommands(
        process.env.CLIENT_ID,
        process.env.GUILD_ID
      ),
      { body: commands }
    );

    console.log("✅ Slash commands registered!");
  } catch (error) {
    console.error("❌ Command registration failed:", error);
  }
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "countdown") {
    await interaction.deferReply();

    try {
      const target = getNextHoliday();

      if (!target) {
        await interaction.editReply("I couldn't calculate the countdown.");
        return;
      }

      // Create a starter message, then attach the thread to it.
      const starter = await interaction.editReply({
        content: "🤫 The countdown has begun...",
        fetchReply: true
      });

      const thread = await starter.startThread({
        name: "Countdown to Secret 👁️",
        autoArchiveDuration: 1440,
        reason: "Start the secret holiday countdown"
      });

      const timerMessage = await thread.send(
        timerContent(target)
      );

      console.log(`✅ Countdown thread created: ${thread.id}`);

      // Keep this timer current while the bot process is running.
      const timer = setInterval(async () => {
        try {
          const nextTarget = getNextHoliday();
          await timerMessage.edit(timerContent(nextTarget));
        } catch (error) {
          console.error("Timer update failed:", error.message);
        }
      }, 60_000);

      // Don't let a timer alone keep the process alive.
      timer.unref();

    } catch (error) {
      console.error("Countdown error:", error);

      await interaction.editReply(
        "I couldn't create the countdown thread. Please check my permissions: View Channels, Send Messages, Create Public Threads, and Send Messages in Threads."
      );
    }
  }

  if (interaction.commandName === "holidays") {
    await interaction.reply({
      content:
        "🎉 I count down to several holidays throughout the year. The actual target stays a secret!",
      ephemeral: true
    });
  }
});

if (
  !process.env.DISCORD_TOKEN ||
  !process.env.CLIENT_ID ||
  !process.env.GUILD_ID
) {
  console.error(
    "❌ Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID environment variables."
  );
  process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);
