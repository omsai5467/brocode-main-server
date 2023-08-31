const fs = require("fs");
const unzipper = require("unzipper");

const zipFilePath = "C:/Users/Nacchu.Omsai/Downloads/filename (30).zip"; // Specify the path to your ZIP file
const destDirectory = "output"; // Specify the destination directory

// Create the destination directory if it doesn't exist
if (!fs.existsSync(destDirectory)) {
  fs.mkdirSync(destDirectory);
}

// Use the unzipper library to extract the ZIP file
fs.createReadStream(zipFilePath)
  .pipe(unzipper.Extract({ path: "/instag" }))
  .on("close", () => {
    console.log("ZIP file extracted successfully.");
  })
  .on("error", (err) => {
    console.error("Error extracting ZIP file:", err);
  });
