const { cmd } = require('../command');
const axios = require('axios');
const cheerio = require('cheerio');
const { sizeFormatter } = require('human-readable');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.google.com/',
};

const formatSize = sizeFormatter();

async function searchPastPapers(query) {
  try {
    const searchUrl = `https://pastpapers.wiki/?s=${encodeURIComponent(query)}`;
    const res = await axios.get(searchUrl, { headers });
    const $ = cheerio.load(res.data);
    const results = [];

    $('.td-module-thumb a').each((i, el) => {
      const title = $(el).attr('title');
      const url = $(el).attr('href');
      if (title && url) {
        results.push({ title, url });
      }
    });

    return results;
  } catch (e) {
    console.error('❌ Error in search:', e.message);
    return [];
  }
}

async function extractFilesFromPage(url) {
  try {
    const res = await axios.get(url, { headers });
    const $ = cheerio.load(res.data);
    const fileLinks = [];

    $('a[href*="drive.google.com"]').each((i, el) => {
      const link = $(el).attr('href');
      const name = $(el).text().trim().replace(/\s+/g, ' ');
      fileLinks.push({ name, link });
    });

    return fileLinks;
  } catch (e) {
    console.error('❌ Error extracting links:', e.message);
    return [];
  }
}

cmd({
  pattern: "pastpaper",
  alias: ["paper", "pp"],
  use: ".pastpaper <subject>",
  desc: "Search and download Sri Lankan past papers",
  category: "education",
  filename: __filename
}, async (conn, mek, m, { from, q, reply }) => {
  try {
    if (!q) return reply("🎓 Please provide a subject name (e.g., O/L Science, A/L ICT)");

    await m.react("📚");

    const results = await searchPastPapers(q);

    if (results.length === 0) return reply("❌ No matching past papers found.");

    let msg = `📘 *Past Paper Search Results*\n\nReply with a number to view available files:\n\n`;
    results.slice(0, 10).forEach((item, i) => {
      msg += `${i + 1}. ${item.title}\n`;
    });

    const sentMsg = await conn.sendMessage(from, { text: msg }, { quoted: mek });

    conn.ev.once('messages.upsert', async (update) => {
      const msg1 = update.messages[0];
      if (!msg1?.message?.extendedTextMessage?.text) return;

      const userChoice = parseInt(msg1.message.extendedTextMessage.text.trim());
      if (isNaN(userChoice) || userChoice < 1 || userChoice > results.length) {
        return conn.sendMessage(from, { text: "❌ Invalid selection." }, { quoted: msg1 });
      }

      const selected = results[userChoice - 1];

      await conn.sendMessage(from, { react: { text: "📂", key: msg1.key } });

      const files = await extractFilesFromPage(selected.url);
      if (files.length === 0) {
        return conn.sendMessage(from, { text: "❌ No files found on the selected page." }, { quoted: msg1 });
      }

      let fileListMsg = `📄 *${selected.title} Files*\n\nReply with a number to download:\n\n`;
      files.slice(0, 10).forEach((file, i) => {
        fileListMsg += `${i + 1}. ${file.name}\n`;
      });

      const sentFileMsg = await conn.sendMessage(from, { text: fileListMsg }, { quoted: msg1 });

      conn.ev.once('messages.upsert', async (update2) => {
        const msg2 = update2.messages[0];
        if (!msg2?.message?.extendedTextMessage?.text) return;

        const fileChoice = parseInt(msg2.message.extendedTextMessage.text.trim());
        if (isNaN(fileChoice) || fileChoice < 1 || fileChoice > files.length) {
          return conn.sendMessage(from, { text: "❌ Invalid file selection." }, { quoted: msg2 });
        }

        const file = files[fileChoice - 1];

        await conn.sendMessage(from, { react: { text: "⬇️", key: msg2.key } });

        await conn.sendMessage(from, {
          document: { url: file.link },
          fileName: file.name + ".pdf",
          mimetype: "application/pdf",
          caption: `📝 *${file.name}*\n📘 *Subject:* ${selected.title}\n📎 *Source:* pastpapers.wiki`,
        }, { quoted: msg2 });

        await conn.sendMessage(from, { react: { text: "✅", key: msg2.key } });
      });
    });

  } catch (err) {
    console.error("❌ Plugin Error:", err);
    reply("⚠️ Something went wrong while fetching past papers.");
  }
});
