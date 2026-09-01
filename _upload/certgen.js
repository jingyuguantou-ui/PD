const crypto = require("crypto");

function len(n) {
  if (n < 128) return Buffer.from([n]);
  const arr = [];
  let x = n;
  while (x > 0) {
    arr.unshift(x & 0xff);
    x = Math.floor(x / 256);
  }
  return Buffer.from([0x80 | arr.length, ...arr]);
}
function tlv(tag, body) {
  return Buffer.concat([Buffer.from([tag]), len(body.length), body]);
}
function seq(items) {
  return tlv(0x30, Buffer.concat(items));
}
function set(items) {
  return tlv(0x31, Buffer.concat(items));
}
function oid(s) {
  const parts = s.split(".").map(Number);
  const enc = [parts[0] * 40 + parts[1]];
  for (let i = 2; i < parts.length; i++) {
    let v = parts[i];
    const bytes = [];
    bytes.unshift(v & 0x7f);
    v = Math.floor(v / 128);
    while (v > 0) {
      bytes.unshift((v & 0x7f) | 0x80);
      v = Math.floor(v / 128);
    }
    enc.push(...bytes);
  }
  return tlv(0x06, Buffer.from(enc));
}
function utf8(s) {
  return tlv(0x0c, Buffer.from(s, "utf8"));
}
function ia5(s) {
  return tlv(0x16, Buffer.from(s, "utf8"));
}
function integerBuf(buf) {
  let b = buf;
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}
function utc(d) {
  const p = (x) => String(x).padStart(2, "0");
  return Buffer.from(
    p(d.getUTCFullYear() % 100) +
      p(d.getUTCMonth() + 1) +
      p(d.getUTCDate()) +
      p(d.getUTCHours()) +
      p(d.getUTCMinutes()) +
      p(d.getUTCSeconds()) +
      "Z",
    "ascii"
  );
}
function name(cn) {
  return seq([set([seq([oid("2.5.4.3"), utf8(cn)])])]);
}
function algId(o) {
  return seq([o, tlv(0x05, Buffer.alloc(0))]);
}
function makeExt(oidStr, valueInnerDer, critical) {
  const parts = [oid(oidStr)];
  if (critical) parts.push(tlv(0x01, Buffer.from([0xff])));
  parts.push(tlv(0x04, valueInnerDer));
  return seq(parts);
}
function pem(label, der) {
  const b64 = der.toString("base64");
  const lines = [];
  for (let i = 0; i < b64.length; i += 64) lines.push(b64.slice(i, i + 64));
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function generateSelfSigned(cn, sans) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const spki = crypto.createPublicKey(privateKey).export({ type: "spki", format: "der" });

  const serial = crypto.randomBytes(8);
  const now = new Date();
  const later = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 365 * 10);

  const sha256Rsa = oid("1.2.840.113549.1.1.11");
  const sigAlg = algId(sha256Rsa);

  const nameSeq = name(cn);

  const names = [];
  for (const s of sans) {
    if (s.startsWith("DNS:")) names.push(tlv(0x82, Buffer.from(s.slice(4), "utf8")));
    else if (s.startsWith("IP:")) {
      const parts = s.slice(3).split(".").map(Number);
      names.push(tlv(0x87, Buffer.from(parts)));
    }
  }
  const sanExt = makeExt("2.5.29.17", seq(names), false);
  const bcExt = makeExt("2.5.29.19", seq([tlv(0x01, Buffer.from([0xff]))]), false);
  const kuExt = makeExt(
    "2.5.29.15",
    tlv(0x03, Buffer.concat([Buffer.from([0x00]), Buffer.from([0xa0])])),
    false
  );
  const extensions = tlv(0xa3, seq([sanExt, bcExt, kuExt]));

  const tbs = seq([
    tlv(0xa0, Buffer.from([0x02, 0x01, 0x02])),
    integerBuf(serial),
    sigAlg,
    nameSeq,
    seq([tlv(0x17, utc(now)), tlv(0x17, utc(later))]),
    nameSeq,
    spki,
    extensions,
  ]);

  const signer = crypto.createSign("SHA256");
  signer.update(tbs);
  const signature = signer.sign(privateKey);
  const certDer = seq([
    tbs,
    sigAlg,
    tlv(0x03, Buffer.concat([Buffer.from([0]), signature])),
  ]);

  const keyPem = privateKey.export({ type: "pkcs8", format: "pem" });
  const certPem = pem("CERTIFICATE", certDer);
  return { key: keyPem, cert: certPem };
}

module.exports = { generateSelfSigned };
