// Test mail catcher: point the test server at it (SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_TLS=false).
// Saves each message as an .eml file and logs "MAIL to … subject: …" lines to sink.log, both in TEST_MAIL_DIR.
const fs = require("node:fs");
const path = require("node:path");
const dir = process.env.TEST_MAIL_DIR || path.join(__dirname, ".mail");
fs.mkdirSync(dir, { recursive: true });
const log = (line) => fs.appendFileSync(path.join(dir, "sink.log"), line + "\n");
const net = require("node:net");
net.createServer((s) => {
  let data = false, buf = "", msg = "", rcpt = [];
  s.write("220 sink ESMTP\r\n");
  s.on("data", (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf("\r\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) {
        if (line === ".") { data = false; const subj = /^Subject: (.*)$/m.exec(msg)?.[1]; log(`MAIL to ${rcpt.join(",")} subject: ${subj}`); fs.writeFileSync(dir + "/" + Date.now() + "-" + Math.random().toString(36).slice(2,6) + ".eml", msg); msg = ""; rcpt = []; s.write("250 ok\r\n"); }
        else msg += line + "\n";
        continue;
      }
      const cmd = line.slice(0, 4).toUpperCase();
      if (cmd === "EHLO") s.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n");
      else if (cmd === "HELO") s.write("250 sink\r\n");
      else if (cmd === "AUTH") s.write("235 ok\r\n");
      else if (cmd === "RCPT") { rcpt.push(line.slice(8)); s.write("250 ok\r\n"); }
      else if (cmd === "DATA") { data = true; s.write("354 go\r\n"); }
      else if (cmd === "QUIT") { s.write("221 bye\r\n"); s.end(); }
      else s.write("250 ok\r\n");
    }
  });
  s.on("error", () => {});
}).listen(2525, "127.0.0.1", () => console.log("sink on 2525"));
