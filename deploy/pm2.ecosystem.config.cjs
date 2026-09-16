module.exports = {
  apps: [
    {
      name: "eclipse-audio-bot",
      script: "src/index.js",
      cwd: __dirname + "/..",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      env: {
        NODE_ENV: "production",
        DATA_DIR: "./data",
        PORT: process.env.PORT || "3000",
      },
    },
  ],
};
