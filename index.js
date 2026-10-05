const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200);
  res.end("Discord Music Bot is online!");
}).listen(PORT, () => {
  console.log(`Web server running on port ${PORT}`);
});
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} = require("discord.js");

const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus
} = require("@discordjs/voice");

const play = require("play-dl");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const commands = [
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("Play a song")
    .addStringOption(option =>
      option
        .setName("song")
        .setDescription("Song name or URL")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("Stop the music"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("Pause the music"),

  new SlashCommandBuilder()
    .setName("resume")
    .setDescription("Resume the music")
].map(command => command.toJSON());

const players = new Map();

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const rest = new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN);

  await rest.put(
    Routes.applicationGuildCommands(
      process.env.CLIENT_ID,
      process.env.GUILD_ID
    ),
    { body: commands }
  );

  console.log("Commands registered!");
});

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("song");
    const voiceChannel = interaction.member.voice.channel;

    if (!voiceChannel) {
      return interaction.reply("❌ Join a voice channel first!");
    }

    await interaction.deferReply();

    try {
      const results = await play.search(query, {
        limit: 1
      });

      if (!results.length) {
        return interaction.editReply("❌ Song not found.");
      }

      const song = results[0];

      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: interaction.guild.id,
        adapterCreator: interaction.guild.voiceAdapterCreator
      });

      const player = createAudioPlayer();

      const stream = await play.stream(song.url);

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type
      });

      player.play(resource);
      connection.subscribe(player);

      players.set(interaction.guild.id, {
        connection,
        player
      });

      player.on(AudioPlayerStatus.Idle, () => {
        connection.destroy();
        players.delete(interaction.guild.id);
      });

      await interaction.editReply(
        `🎵 Now playing: **${song.title}**`
      );

    } catch (error) {
      console.error(error);
      await interaction.editReply(
        "❌ Couldn't play that song."
      );
    }
  }

  if (interaction.commandName === "pause") {
    const music = players.get(interaction.guild.id);

    if (!music) {
      return interaction.reply("❌ Nothing is playing.");
    }

    music.player.pause();
    await interaction.reply("⏸️ Music paused.");
  }

  if (interaction.commandName === "resume") {
    const music = players.get(interaction.guild.id);

    if (!music) {
      return interaction.reply("❌ Nothing is playing.");
    }

    music.player.unpause();
    await interaction.reply("▶️ Music resumed.");
  }

  if (interaction.commandName === "stop") {
    const music = players.get(interaction.guild.id);

    if (!music) {
      return interaction.reply("❌ Nothing is playing.");
    }

    music.player.stop();
    music.connection.destroy();

    players.delete(interaction.guild.id);

    await interaction.reply("⏹️ Music stopped.");
  }
});

client.login(process.env.DISCORD_TOKEN);
