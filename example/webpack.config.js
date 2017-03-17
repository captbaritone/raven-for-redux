const path = require("path");
module.exports = {
  devServer: {
    contentBase: __dirname
  },
  entry: path.join(__dirname, "index.js"),
  output: {
    filename: "build.js",
    path: __dirname
  }
};
