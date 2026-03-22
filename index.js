require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const express = require("express");
const cors = require("cors");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
  ],
});

const app = express();
app.use(express.json());
app.use(cors());

const GUILD_ID = process.env.GUILD_ID;
const API_SECRET = process.env.API_SECRET;

client.once("ready", () => {
  console.log(`✅ Bot online as ${client.user.tag}`);
});

// Helper — find member by username
async function findMember(guild, username) {
  await guild.members.fetch();
  const input = (username || "").toLowerCase().trim();
  const member = guild.members.cache.find((m) => {
    const tag = m.user.tag.toLowerCase();
    const globalName = (m.user.globalName || "").toLowerCase();
    const uname = m.user.username.toLowerCase();
    return tag === input || globalName === input || uname === input ||
           // Also try partial/without discriminator
           tag.startsWith(input + '#') || uname.includes(input);
  });
  if (!member) {
    // Log all member usernames to help debug
    const names = guild.members.cache.map(m => m.user.username + ' / ' + m.user.tag).join(', ');
    console.log(`❌ Could not find "${input}" in server. Members: ${names}`);
  }
  return member;
}

// ── STRIKE ──
app.post("/strike", async (req, res) => {
  const { secret, username, reason, strikeCount, by } = req.body;
  if (secret !== API_SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!username || !reason) return res.status(400).json({ error: "Missing username or reason" });
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await findMember(guild, username);
    if (!member) return res.status(404).json({ error: `User "${username}" not found in server` });

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Strike Received")
      .setColor(0xe03060)
      .addFields(
        { name: "📋 Reason", value: reason, inline: false },
        { name: "🔢 Level", value: `${strikeCount || "N/A"}`, inline: true },
        { name: "👤 Issued By", value: by || "Management", inline: true }
      )
      .setFooter({ text: "Please review the server rules to avoid further action." })
      .setTimestamp();

    await member.send({ embeds: [embed] });
    return res.json({ success: true, sentTo: member.user.tag });
  } catch (err) {
    if (err.code === 50007) return res.status(400).json({ error: "User has DMs disabled" });
    return res.status(500).json({ error: "Failed to send strike DM" });
  }
});

// ── NOTIFY (points / warnings / approval) ──
app.post("/notify", async (req, res) => {
  const { secret, username, type, amount, reason, by } = req.body;
  if (secret !== API_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await findMember(guild, username);
    if (!member) return res.status(404).json({ error: `User "${username}" not found` });

    let embed;

    if (type === "points") {
      const n = Number(amount);
      embed = new EmbedBuilder()
        .setTitle(n >= 0 ? "⭐ Points Awarded" : "📉 Points Deducted")
        .setColor(n >= 0 ? 0x20d880 : 0xff4444)
        .addFields(
          { name: "💰 Amount", value: `${n > 0 ? "+" : ""}${n} pts`, inline: true },
          { name: "👤 By", value: by || "Management", inline: true },
          { name: "📝 Reason", value: reason || "No reason provided", inline: false }
        )
        .setFooter({ text: "Keep up the great work!" })
        .setTimestamp();

    } else if (type === "warning") {
      embed = new EmbedBuilder()
        .setTitle("⚠️ Warning Issued")
        .setColor(0xff8820)
        .addFields(
          { name: "📋 Note", value: reason || "No details provided", inline: false },
          { name: "👤 Issued By", value: by || "Management", inline: true }
        )
        .setFooter({ text: "Please ensure compliance with the server rules." })
        .setTimestamp();

    } else if (type === "approval") {
      embed = new EmbedBuilder()
        .setTitle("✅ Account Activated")
        .setColor(0x20d880)
        .setDescription("Your leadership panel account has been approved and is now active.")
        .addFields(
          { name: "🔑 Next Step", value: "You can now log in to the Leadership Panel with your username and password.", inline: false }
        )
        .setFooter({ text: "Welcome to the leadership team!" })
        .setTimestamp();
    }

    if (!embed) {
      console.error(`❌ /notify — unknown type: "${type}"`);
      return res.status(400).json({ error: `Unknown notify type: ${type}` });
    }
    await member.send({ embeds: [embed] });
    console.log(`✅ ${type} DM sent to ${member.user.tag}`);
    return res.json({ success: true, sentTo: member.user.tag });
  } catch (err) {
    console.error(`❌ /notify error:`, err.message);
    if (err.code === 50007) return res.status(400).json({ error: "User has DMs disabled" });
    return res.status(500).json({ error: err.message || "Failed to send DM" });
  }
});

// ── REQUEST (account submitted) ──
app.post("/request", async (req, res) => {
  const { secret, username } = req.body;
  if (secret !== API_SECRET) return res.status(401).json({ error: "Unauthorized" });
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await findMember(guild, username);
    if (!member) return res.status(404).json({ error: `User "${username}" not found` });

    const embed = new EmbedBuilder()
      .setTitle("📝 Account Request Received")
      .setColor(0xffd700)
      .setDescription("Your leadership panel account request has been submitted successfully.")
      .addFields(
        { name: "⏳ Status", value: "Your request is now pending review. It will be approved shortly by an owner.", inline: false }
      )
      .setFooter({ text: "You will receive another DM once a decision has been made." })
      .setTimestamp();

    await member.send({ embeds: [embed] });
    return res.json({ success: true, sentTo: member.user.tag });
  } catch (err) {
    if (err.code === 50007) return res.status(400).json({ error: "User has DMs disabled" });
    return res.status(500).json({ error: "Failed to send DM" });
  }
});

// Health check
app.get("/", (req, res) => res.json({ status: "Bot is running" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 API running on port ${PORT}`));

client.login(process.env.BOT_TOKEN);