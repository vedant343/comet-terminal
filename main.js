const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const { OpenAI } = require("@langchain/openai");
const dotenv = require("dotenv").config();
const path = require("path");
const fs = require("fs");

let mainWindow;
let isFirstTime = true;
const model = new OpenAI({});
process.chdir("/");

function createWindow() {
  mainWindow = new BrowserWindow({
    title: "Parent",
    width: 1800,
    height: 1100,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Note: For better security, use contextIsolation: true with a preload script
    },
  });
  //mainWindow.setFullScreen(true);
  mainWindow.loadFile("index.html");
  mainWindow.on("closed", function () {
    mainWindow = null;
  });

  //check uf it is first time
  const keyEnvPath = path.join(__dirname, "/.key-env");
  if (isFirstTime && !fs.existsSync(keyEnvPath)) {
    isFirstTime = false;
    showPopup();
  }
  showPopup();
}

function showPopup() {
  let keyWindow = new BrowserWindow({
    title: "child",
    parent: mainWindow,
    modal: true,
    width: 1400,
    height: 800,
    frame: true,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  keyWindow.loadFile("key-popup.html");
  mainWindow.setEnabled(true);
  keyWindow.on("focus", () => {
    const parentPosition = mainWindow.getPosition();
    const parentSize = mainWindow.getSize();
    const childSize = keyWindow.getSize();
    const x = parentPosition[0] + (parentSize[0] - childSize[0]) / 2;
    const y = parentPosition[1] + (parentSize[1] - childSize[1]) / 2;
    keyWindow.setPosition(x, y);
  });
  keyWindow.on("closed", function () {
    keyWindow = null;
    mainWindow.focus(); // Focus on main window after closing the child window
  });

  ipcMain.once("key-submitted", (event, key) => {
    console.log("thisis dir", __dirname);
    fs.writeFileSync(
      path.join(__dirname, "/.key-env"),
      `OPENAI_API_KEY=${key}`
    );
    // mainWindow.webContents.send("set-openai-key", key);
    keyWindow.close();
  });
}

app.on("ready", createWindow);

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", function () {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle saving input history in the main process
ipcMain.on("save-input-history", (event, inputHistory) => {
  fs.writeFileSync(
    __dirname + "/inputHistory.json",
    JSON.stringify(inputHistory)
  );
});

// Handle loading input history in the main process
ipcMain.on("load-input-history", (event) => {
  if (fs.existsSync(__dirname + "/inputHistory.json")) {
    const data = fs.readFileSync(__dirname + "/inputHistory.json");
    event.sender.send("input-history-loaded", JSON.parse(data));
  }
});

// Listen for the 'run-command' IPC message
ipcMain.on("run-command", (event, command) => {
  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      event.sender.send("command-error", `Error: ${error.message}`);
      return;
    }
    // Send both stdout and stderr to the renderer
    event.sender.send("command-output", stdout + stderr);
  });
});

// Listen for the 'command-ai' IPC message
ipcMain.on("command-ai", async (event, text) => {
  console.log("Received AI command:", text);
  var command = await askLLMCommand(text);
  var explaination = await askLLMCommandExplanation(command);

  var output = { command: command, explaination: explaination };
  event.sender.send("command-ai", output);
});

ipcMain.on("dummy", async (event, text) => {
  // console.log("Received dummy", text);
  // try {
  //   const result = await runSpeedTest();
  //   console.log("speedtest-result", result);
  // } catch (error) {
  //   console.log("speedtest-error", error.message);
  // }
  //event.sender.send("command-error-ai",data);
});

ipcMain.on("command-error-ai", async (event, text) => {
  var command = text.input;
  var commandError = text.output;
  console.log(
    "Received error for ai command:" + command + "error is :" + commandError
  );

  var data = await askLLMError(command, commandError);
  event.sender.send("command-error-ai", data);
});
ipcMain.on("command-help", async (event, text) => {
  console.log("Received command for help:", text);
  var helpOutput = await askLLMHelp(text);
  event.sender.send("command-help", helpOutput);
});

async function askLLMCommand(prompt) {
  var res = await model.invoke(
    "Create a Linux command to " +
      prompt +
      " Then provide the command without any additional explanation, remove extra space and new line characters and only give the command."
  );
  res = res.replace(/\\n|"/g, "");
  console.log(JSON.stringify(res));
  return JSON.stringify(res);
}
async function askLLMCommandExplanation(command) {
  var res = await model.invoke(
    "give me the explanation of this linux command in three bullet points: 1. what does it do 2. How does it work 3. Syntax and Options in markdown format" +
      command +
      "Please provide the Explanation within 200 words and ensure it's nicely formatted in Markdown with bullet points and syntax highlighting for the command. Justify the content and also remove any <code>\\n</code> in the beginning and return newline in break tag not \n."
  );

  console.log(JSON.stringify(res));
  return JSON.stringify(res);
}
async function askLLMError(command, commandError) {
  const res = await model.invoke(
    "This is the command I entered: " +
      command +
      " And this is the error I got: " +
      commandError +
      " Please provide the direct solution within 150 words and ensure it's nicely formatted in Markdown with bullet points and syntax highlighting for the command. Justify the content and also remove any \n in the beginning and return newline in single break tag not newline character"
  );
  console.log(JSON.stringify(res));
  return JSON.stringify(res);
}
async function askLLMHelp(command) {
  var res = await model.invoke(
    "give me the summarized explanation of this linux command direct in three bullet points: 1. what does it do 2. How does it work 3. Syntax and Options in markdown format" +
      command +
      "Please provide the Summary within 200 words and ensure it's nicely formatted in Markdown with bullet points and syntax highlighting for the command. Justify the content and also remove any \n in the beginning and return newline in single break tag not newline character"
  );
  console.log(JSON.stringify(res));
  return JSON.stringify(res);
}
